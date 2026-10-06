"use strict";
/*
 * Módulo compartilhado entre pluggy-webhook.js e pluggy-sync.js — não é um
 * endpoint (fica em lib/, fora da varredura de funções do Netlify).
 *
 * Risco aberto (ver PLUGGY.md "Limitações conhecidas"): a convenção de sinal
 * do campo `amount` da Pluggy não foi confirmada contra um payload real.
 * Assumimos aqui o padrão mais comum em agregadores (negativo = saiu da
 * conta/fatura, ou seja, despesa) — se o primeiro sync real mostrar receita e
 * despesa trocadas, inverta só a constante PLUGGY_AMOUNT_SIGN abaixo.
 */
const PLUGGY_AMOUNT_SIGN = -1; // multiplique por isto antes de testar o sinal

const PLUGGY_API = "https://api.pluggy.ai";

let cachedKey = null; // {key, expiresAt}

async function getApiKey() {
  if (cachedKey && cachedKey.expiresAt > Date.now()) return cachedKey.key;
  const res = await fetch(PLUGGY_API + "/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: process.env.PLUGGY_CLIENT_ID,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET
    })
  });
  if (!res.ok) throw new Error("Pluggy /auth falhou: " + res.status + " " + (await res.text()));
  const { apiKey } = await res.json();
  // a chave dura 2h; guardamos por 1h50 de folga.
  cachedKey = { key: apiKey, expiresAt: Date.now() + 110 * 60 * 1000 };
  return apiKey;
}

async function pluggyGet(path) {
  const apiKey = await getApiKey();
  const res = await fetch(PLUGGY_API + path, { headers: { "X-API-KEY": apiKey } });
  if (!res.ok) throw new Error("Pluggy GET " + path + " falhou: " + res.status + " " + (await res.text()));
  return res.json();
}

/* Contas de cartão de crédito do item configurado — é daqui que tiramos o
   accountId usado nas chamadas de transações/faturas abaixo. */
async function fetchCreditAccounts(itemId) {
  const { results } = await pluggyGet("/accounts?itemId=" + encodeURIComponent(itemId));
  return (results || []).filter(a => a.type === "CREDIT");
}

/* Transações recentes (inclui as ainda PENDING, sem billId) de uma conta.
   GET /transactions (v1, por página) foi descontinuado pela Pluggy em 2026
   pra contas criadas depois de junho — devolve 410. O substituto, /v2/
   transactions, pagina por cursor: cada resposta traz `next`, uma query
   string pronta pra colar direto na mesma rota; `next: null` é o fim. */
async function fetchRecentTransactions(accountId) {
  let path = "/v2/transactions?accountId=" + encodeURIComponent(accountId);
  const out = [];
  while (path) {
    const { results, next } = await pluggyGet(path);
    out.push(...(results || []));
    path = next ? "/v2/transactions" + next : null;
  }
  return out;
}

/* Faturas da conta e, para cada uma, as transações já POSTED vinculadas. */
async function fetchBillTransactions(accountId) {
  const { results: bills } = await pluggyGet("/bills?accountId=" + encodeURIComponent(accountId));
  const out = [];
  for (const bill of bills || []) {
    const { results } = await pluggyGet("/bills/" + encodeURIComponent(bill.id) + "/transactions?pageSize=500");
    for (const t of results || []) out.push(Object.assign({}, t, { billId: bill.id }));
  }
  return out;
}

function mapTransaction(t, itemId, accountId) {
  const signedCents = Math.round(t.amount * 100) * PLUGGY_AMOUNT_SIGN;
  return {
    transaction_id: t.id,
    user_id: process.env.AJE_USER_ID,
    item_id: itemId,
    account_id: accountId,
    bill_id: t.billId || null,
    date: (t.date || "").slice(0, 10),
    description: t.description || t.descriptionRaw || "Nubank",
    amount_cents: Math.abs(signedCents),
    tipo: signedCents < 0 ? "d" : "r",
    status: t.status || "PENDING",
    category_pluggy: t.category || null,
    installment_number: (t.creditCardMetadata && t.creditCardMetadata.installmentNumber) || null,
    installment_total: (t.creditCardMetadata && t.creditCardMetadata.totalInstallments) || null,
    raw: t
  };
}

/* Upsert idempotente por transaction_id — "do update", não "do nothing",
   porque transações PENDING mudam de valor/status/billId até serem POSTED
   (ver PLUGGY.md). */
async function upsertRows(supabase, rows) {
  if (!rows.length) return { count: 0 };
  const { error } = await supabase.from("pluggy_tx").upsert(rows, { onConflict: "transaction_id" });
  if (error) throw error;
  return { count: rows.length };
}

/* Ponto de entrada único usado tanto pelo webhook quanto pelo sync manual:
   busca tudo que existe hoje pro item configurado e grava. */
async function syncItem(supabase) {
  const itemId = process.env.PLUGGY_ITEM_ID;
  const accounts = await fetchCreditAccounts(itemId);
  let total = 0;
  for (const acc of accounts) {
    const [recent, billed] = await Promise.all([
      fetchRecentTransactions(acc.id),
      fetchBillTransactions(acc.id)
    ]);
    const byId = new Map();
    for (const t of recent.concat(billed)) byId.set(t.id, t); // billed tem prioridade (tem billId)
    for (const t of billed) byId.set(t.id, t);
    const rows = Array.from(byId.values()).map(t => mapTransaction(t, itemId, acc.id));
    const { count } = await upsertRows(supabase, rows);
    total += count;
  }
  return { accounts: accounts.length, transactions: total };
}

module.exports = { getApiKey, fetchCreditAccounts, fetchRecentTransactions, fetchBillTransactions, syncItem };

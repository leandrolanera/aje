"use strict";
/*
 * Módulo compartilhado entre pluggy-webhook.js e pluggy-sync.js — não é um
 * endpoint: o prefixo `_` é o que faz o Vercel não expor o arquivo como rota.
 * O fallback em netlify/functions/ também importa daqui.
 *
 * Tipo (despesa/receita) sai do campo `type` da Pluggy (DEBIT/CREDIT), que
 * não depende de convenção. Conferido contra o extrato real do Nubank: compra
 * vem DEBIT com `amount` positivo, pagamento/estorno/IOF devolvido vem CREDIT
 * com `amount` negativo. O sinal do `amount` fica só de fallback pra
 * transação que venha sem `type`.
 */
const PLUGGY_AMOUNT_SIGN = -1; // fallback: amount positivo = despesa

/* A Pluggy manda a data em UTC ("2026-09-25T22:51:07Z"). Cortar o texto
   direto joga compra feita depois das 21h de Brasília pro dia seguinte — e no
   dia do fechamento isso muda a fatura. Brasil não tem horário de verão desde
   2019, então UTC-3 fixo basta. Parcelas futuras vêm em 03:00Z (meia-noite
   local) e não mudam de dia. */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
function localDate(s) {
  if (!s) return "";
  const ms = Date.parse(s);
  if (!s.includes("T") || isNaN(ms)) return s.slice(0, 10);
  return new Date(ms - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

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

/* Todas as transações da conta, incluindo as parcelas futuras (a Pluggy as
   devolve com a data do mês em que serão cobradas — é daí que o app monta as
   faturas futuras).

   PLUGGY_DATE_FROM (yyyy-mm-dd, opcional) corta o histórico na origem: sem
   ele a Pluggy devolve tudo que existe, o que deixa cada sync caro à toa
   quando só interessam as faturas a partir de certa data. Também é o que faz
   uma limpeza manual na tabela do Supabase valer: sem o corte aqui, as linhas
   apagadas voltam no sync seguinte.

   GET /transactions (v1, por página) foi descontinuado pela Pluggy em 2026
   pra contas criadas depois de junho — devolve 410. O substituto, /v2/
   transactions, pagina por cursor: cada resposta traz `next`, uma query
   string pronta pra colar direto na mesma rota (já carregando os filtros
   originais); `next: null` é o fim. */
async function fetchRecentTransactions(accountId) {
  const from = process.env.PLUGGY_DATE_FROM;
  let path = "/v2/transactions?accountId=" + encodeURIComponent(accountId)
    + (from ? "&dateFrom=" + encodeURIComponent(from) : "");
  const out = [];
  while (path) {
    const { results, next } = await pluggyGet(path);
    out.push(...(results || []));
    path = next ? "/v2/transactions" + next : null;
  }
  return out;
}

function mapTransaction(t, itemId, accountId) {
  const signedCents = Math.round(t.amount * 100) * PLUGGY_AMOUNT_SIGN;
  const tipo = t.type === "DEBIT" ? "d" : t.type === "CREDIT" ? "r" : (signedCents < 0 ? "d" : "r");
  return {
    transaction_id: t.id,
    user_id: process.env.AJE_USER_ID,
    item_id: itemId,
    account_id: accountId,
    bill_id: t.billId || null,
    date: localDate(t.date),
    description: t.description || t.descriptionRaw || "Nubank",
    amount_cents: Math.abs(signedCents),
    tipo,
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
   busca tudo que existe hoje pro item configurado e grava.
   Só /v2/transactions — não /bills/:id/transactions (ver comentário em
   fetchRecentTransactions): mesmo objeto de transação é atualizado com
   billId/status=POSTED quando a fatura fecha, sem precisar do endpoint de
   faturas, que devolveu 403 (produto fora do tier gratuito do Meu Pluggy). */
async function syncItem(supabase) {
  const itemId = process.env.PLUGGY_ITEM_ID;
  const accounts = await fetchCreditAccounts(itemId);
  let total = 0;
  for (const acc of accounts) {
    const txs = await fetchRecentTransactions(acc.id);
    const rows = txs.map(t => mapTransaction(t, itemId, acc.id));
    const { count } = await upsertRows(supabase, rows);
    total += count;
  }
  return { accounts: accounts.length, transactions: total };
}

module.exports = { getApiKey, fetchCreditAccounts, fetchRecentTransactions, syncItem };

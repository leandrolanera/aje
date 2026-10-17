"use strict";
/*
 * Funções de servidor: o módulo compartilhado (api/_pluggy.js) e os dois
 * endpoints. Nada aqui toca a rede nem o Supabase de verdade — `fetch` e o
 * cliente Supabase são substituídos por dublês que registram as chamadas.
 *
 * `mapTransaction` não é exportado de propósito (é detalhe interno), então é
 * exercitado pela superfície pública: o que `syncItem` manda gravar.
 */
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const LIB = path.join(__dirname, "..", "api", "_pluggy.js");
const SYNC = path.join(__dirname, "..", "api", "pluggy-sync.js");
const HOOK = path.join(__dirname, "..", "api", "pluggy-webhook.js");

const fetchOriginal = global.fetch;
const envOriginal = { ...process.env };

/* Dublê do @supabase/supabase-js: guarda o que foi passado ao upsert. */
function instalaSupabaseFalso() {
  const chamadas = [];
  require.cache[require.resolve("@supabase/supabase-js", { paths: [path.dirname(LIB)] })] = {
    id: "supabase-falso", filename: "supabase-falso", loaded: true,
    exports: {
      createClient: () => ({
        from: tabela => ({
          upsert: async (linhas, opcoes) => { chamadas.push({ tabela, linhas, opcoes }); return { error: null }; }
        })
      })
    }
  };
  return chamadas;
}

/* Recarrega os módulos para que cada teste veja estado limpo (o cache da
   API key do Pluggy vive em variável de módulo). */
function carrega() {
  for (const p of [LIB, SYNC, HOOK]) delete require.cache[require.resolve(p)];
  return { lib: require(LIB), sync: require(SYNC), hook: require(HOOK) };
}

/* `res` no formato que o Vercel entrega ao handler. */
function mkRes() {
  const r = { code: 0, body: null };
  r.status = c => { r.code = c; return r; };
  r.send = b => { r.body = b; return r; };
  r.json = o => { r.body = o; return r; };
  return r;
}

/* Respostas padrão da Pluggy, sobrescrevíveis por teste. */
function instalaFetch({ auth, accounts, pages } = {}) {
  const urls = [];
  global.fetch = async (url, opts) => {
    urls.push({ url: String(url).replace("https://api.pluggy.ai", ""), opts });
    if (String(url).includes("/auth")) {
      return auth || { ok: true, json: async () => ({ apiKey: "chave-fake" }) };
    }
    if (String(url).includes("/accounts")) {
      return accounts || { ok: true, json: async () => ({ results: [{ id: "acc1", type: "CREDIT" }] }) };
    }
    if (String(url).includes("/v2/transactions")) {
      const p = (pages || [{ results: [], next: null }]);
      const i = urls.filter(u => u.url.includes("/v2/transactions")).length - 1;
      const pg = p[Math.min(i, p.length - 1)];
      return { ok: true, json: async () => pg };
    }
    throw new Error("URL não prevista no teste: " + url);
  };
  return urls;
}

beforeEach(() => {
  process.env.AJE_USER_ID = "user-1";
  process.env.PLUGGY_ITEM_ID = "item-1";
  process.env.PLUGGY_CLIENT_ID = "cid";
  process.env.PLUGGY_CLIENT_SECRET = "csec";
  process.env.PLUGGY_SYNC_SECRET = "s3cr3t";
  process.env.PLUGGY_WEBHOOK_SECRET = "wh00k";
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  delete process.env.PLUGGY_DATE_FROM;
});
afterEach(() => {
  global.fetch = fetchOriginal;
  process.env = { ...envOriginal };
});

/* ---------- autenticação ---------- */

test("autentica com clientId/clientSecret e reusa a chave nas chamadas seguintes", async () => {
  const urls = instalaFetch();
  const { lib } = carrega();
  await lib.fetchCreditAccounts("item-1");
  await lib.fetchCreditAccounts("item-1");
  assert.equal(urls.filter(u => u.url === "/auth").length, 1, "a chave de 2h é reaproveitada");
  const chamada = urls.find(u => u.url === "/auth");
  assert.deepEqual(JSON.parse(chamada.opts.body), { clientId: "cid", clientSecret: "csec" });
});

test("envia a API key no header das chamadas de dados", async () => {
  const urls = instalaFetch();
  const { lib } = carrega();
  await lib.fetchCreditAccounts("item-1");
  const chamada = urls.find(u => u.url.startsWith("/accounts"));
  assert.equal(chamada.opts.headers["X-API-KEY"], "chave-fake");
});

test("erro de autenticação sobe com status e corpo", async () => {
  instalaFetch({ auth: { ok: false, status: 401, text: async () => "não autorizado" } });
  const { lib } = carrega();
  await assert.rejects(() => lib.fetchCreditAccounts("item-1"), /401.*não autorizado/s);
});

/* ---------- contas ---------- */

test("só contas de crédito entram no sync", async () => {
  instalaFetch({ accounts: { ok: true, json: async () => ({ results: [
    { id: "cartao", type: "CREDIT" }, { id: "corrente", type: "BANK" }
  ] }) } });
  const { lib } = carrega();
  const contas = await lib.fetchCreditAccounts("item-1");
  assert.deepEqual(contas.map(c => c.id), ["cartao"]);
});

/* ---------- paginação por cursor ---------- */

test("segue o cursor até next virar null", async () => {
  const urls = instalaFetch({ pages: [
    { results: [{ id: "t1" }, { id: "t2" }], next: "?accountId=acc1&after=P2" },
    { results: [{ id: "t3" }], next: null }
  ] });
  const { lib } = carrega();
  const r = await lib.fetchRecentTransactions("acc1");
  assert.deepEqual(r.map(t => t.id), ["t1", "t2", "t3"]);
  const chamadas = urls.filter(u => u.url.includes("/v2/transactions")).map(u => u.url);
  assert.equal(chamadas.length, 2);
  assert.ok(chamadas[1].includes("after=P2"), "a segunda chamada usa o cursor devolvido");
});

test("usa /v2/transactions, não o endpoint v1 descontinuado", async () => {
  /* O v1 responde 410 para contas criadas depois de junho/2026. */
  const urls = instalaFetch();
  const { lib } = carrega();
  await lib.fetchRecentTransactions("acc1");
  const t = urls.filter(u => u.url.includes("transactions")).map(u => u.url);
  assert.ok(t.every(u => u.startsWith("/v2/transactions")), "não pode chamar /transactions puro");
});

test("PLUGGY_DATE_FROM corta o histórico na origem quando definido", async () => {
  process.env.PLUGGY_DATE_FROM = "2026-09-18";
  const urls = instalaFetch();
  const { lib } = carrega();
  await lib.fetchRecentTransactions("acc1");
  assert.ok(urls.find(u => u.url.includes("dateFrom=2026-09-18")));
});

test("sem PLUGGY_DATE_FROM não manda filtro de data", async () => {
  const urls = instalaFetch();
  const { lib } = carrega();
  await lib.fetchRecentTransactions("acc1");
  assert.ok(!urls.find(u => u.url.includes("dateFrom")));
});

/* ---------- mapeamento (via syncItem) ---------- */

async function linhasDe(transacoes) {
  const chamadas = instalaSupabaseFalso();
  instalaFetch({ pages: [{ results: transacoes, next: null }] });
  const { lib } = carrega();
  const { createClient } = require("@supabase/supabase-js");
  await lib.syncItem(createClient());
  return chamadas[0] ? chamadas[0].linhas : [];
}

test("tipo vem do campo type da Pluggy, não do sinal do valor", async () => {
  const [compra, estorno] = await linhasDe([
    { id: "a", type: "DEBIT", amount: 45.9, date: "2026-10-05", description: "iFood" },
    { id: "b", type: "CREDIT", amount: -45.9, date: "2026-10-06", description: "Estorno" }
  ]);
  assert.equal(compra.tipo, "d");
  assert.equal(estorno.tipo, "r");
  assert.equal(compra.amount_cents, 4590, "o valor é sempre positivo; o sinal mora no tipo");
  assert.equal(estorno.amount_cents, 4590);
});

test("sem type, o sinal do valor decide", async () => {
  const [pos, neg] = await linhasDe([
    { id: "a", amount: 10, date: "2026-10-05", description: "X" },
    { id: "b", amount: -10, date: "2026-10-05", description: "Y" }
  ]);
  assert.equal(pos.tipo, "d", "amount positivo sem type é despesa");
  assert.equal(neg.tipo, "r");
});

test("converte o valor para centavo inteiro", async () => {
  const [l] = await linhasDe([{ id: "a", type: "DEBIT", amount: 0.1 + 0.2, date: "2026-10-05", description: "X" }]);
  assert.equal(l.amount_cents, 30, "0.30000000000000004 não pode virar 30.000000000000004");
});

test("data é convertida de UTC para o dia local", async () => {
  /* Compra às 22:51Z de 25/09 é 19:51 de 25/09 em Brasília — mas 00:30Z de
     26/09 é ainda 21:30 de 25/09, e no dia do fechamento isso muda a fatura. */
  const [a, b] = await linhasDe([
    { id: "a", type: "DEBIT", amount: 1, date: "2026-09-25T22:51:07Z", description: "X" },
    { id: "b", type: "DEBIT", amount: 1, date: "2026-09-26T00:30:00Z", description: "Y" }
  ]);
  assert.equal(a.date, "2026-09-25");
  assert.equal(b.date, "2026-09-25", "00:30Z ainda é dia 25 no Brasil");
});

test("data sem hora passa direto", async () => {
  const [l] = await linhasDe([{ id: "a", type: "DEBIT", amount: 1, date: "2026-09-25", description: "X" }]);
  assert.equal(l.date, "2026-09-25");
});

test("guarda parcelas, categoria e payload bruto", async () => {
  const [l] = await linhasDe([{
    id: "a", type: "DEBIT", amount: 100, date: "2026-10-05", description: "Notebook",
    category: "Shopping", status: "POSTED",
    creditCardMetadata: { installmentNumber: 3, totalInstallments: 10, billForecastDate: "2026-11" }
  }]);
  assert.equal(l.installment_number, 3);
  assert.equal(l.installment_total, 10);
  assert.equal(l.category_pluggy, "Shopping");
  assert.equal(l.status, "POSTED");
  assert.equal(l.raw.creditCardMetadata.billForecastDate, "2026-11",
    "o mês da fatura é lido do raw pelo app, então precisa estar guardado");
});

test("descrição tem fallback e nunca fica vazia", async () => {
  const [a, b] = await linhasDe([
    { id: "a", type: "DEBIT", amount: 1, date: "2026-10-05", descriptionRaw: "SO O BRUTO" },
    { id: "b", type: "DEBIT", amount: 1, date: "2026-10-05" }
  ]);
  assert.equal(a.description, "SO O BRUTO");
  assert.equal(b.description, "Nubank");
});

test("status ausente vira PENDING", async () => {
  const [l] = await linhasDe([{ id: "a", type: "DEBIT", amount: 1, date: "2026-10-05", description: "X" }]);
  assert.equal(l.status, "PENDING");
});

test("updated_at é escrito a cada sync", async () => {
  /* O default now() da coluna só vale no INSERT; sem escrever explicitamente,
     o "sincronizado há N min" congelaria na primeira vez que a transação
     apareceu. */
  const antes = Date.now();
  const [l] = await linhasDe([{ id: "a", type: "DEBIT", amount: 1, date: "2026-10-05", description: "X" }]);
  const t = Date.parse(l.updated_at);
  assert.ok(t >= antes - 1000 && t <= Date.now() + 1000, "updated_at precisa ser o agora do sync");
});

test("cada linha carrega o usuário, o item e a conta", async () => {
  const [l] = await linhasDe([{ id: "a", type: "DEBIT", amount: 1, date: "2026-10-05", description: "X" }]);
  assert.equal(l.user_id, "user-1");
  assert.equal(l.item_id, "item-1");
  assert.equal(l.account_id, "acc1");
  assert.equal(l.transaction_id, "a");
});

/* ---------- syncItem ---------- */

test("syncItem grava com upsert idempotente por transaction_id", async () => {
  const chamadas = instalaSupabaseFalso();
  instalaFetch({ pages: [{ results: [{ id: "a", type: "DEBIT", amount: 1, date: "2026-10-05", description: "X" }], next: null }] });
  const { lib } = carrega();
  const { createClient } = require("@supabase/supabase-js");
  const r = await lib.syncItem(createClient());
  assert.equal(chamadas[0].tabela, "pluggy_tx");
  assert.equal(chamadas[0].opcoes.onConflict, "transaction_id",
    "precisa ser 'do update': transação PENDING muda de valor/status até confirmar");
  assert.deepEqual(r, { accounts: 1, transactions: 1 });
});

test("syncItem não chama o banco quando não há transação", async () => {
  const chamadas = instalaSupabaseFalso();
  instalaFetch({ pages: [{ results: [], next: null }] });
  const { lib } = carrega();
  const { createClient } = require("@supabase/supabase-js");
  const r = await lib.syncItem(createClient());
  assert.equal(chamadas.length, 0);
  assert.deepEqual(r, { accounts: 1, transactions: 0 });
});

test("syncItem percorre todas as contas de crédito do item", async () => {
  const chamadas = instalaSupabaseFalso();
  instalaFetch({
    accounts: { ok: true, json: async () => ({ results: [{ id: "c1", type: "CREDIT" }, { id: "c2", type: "CREDIT" }] }) },
    pages: [{ results: [{ id: "x", type: "DEBIT", amount: 1, date: "2026-10-05", description: "X" }], next: null }]
  });
  const { lib } = carrega();
  const { createClient } = require("@supabase/supabase-js");
  const r = await lib.syncItem(createClient());
  assert.equal(r.accounts, 2);
  assert.equal(chamadas.length, 2, "um upsert por conta");
});

test("erro do banco não é engolido", async () => {
  require.cache[require.resolve("@supabase/supabase-js", { paths: [path.dirname(LIB)] })] = {
    id: "x", filename: "x", loaded: true,
    exports: { createClient: () => ({ from: () => ({ upsert: async () => ({ error: new Error("permissão negada") }) }) }) }
  };
  instalaFetch({ pages: [{ results: [{ id: "a", type: "DEBIT", amount: 1, date: "2026-10-05", description: "X" }], next: null }] });
  const { lib } = carrega();
  const { createClient } = require("@supabase/supabase-js");
  await assert.rejects(() => lib.syncItem(createClient()), /permissão negada/);
});

/* ---------- endpoint de sync manual ---------- */

test("pluggy-sync recusa sem chave e com chave errada", async () => {
  instalaSupabaseFalso(); instalaFetch();
  const { sync } = carrega();
  for (const query of [{}, { key: "" }, { key: "errada" }]) {
    const res = mkRes();
    await sync({ query }, res);
    assert.equal(res.code, 403, "query " + JSON.stringify(query));
  }
});

test("pluggy-sync roda o sync com a chave certa", async () => {
  instalaSupabaseFalso();
  instalaFetch({ pages: [{ results: [{ id: "a", type: "DEBIT", amount: 1, date: "2026-10-05", description: "X" }], next: null }] });
  const { sync } = carrega();
  const res = mkRes();
  await sync({ query: { key: "s3cr3t" } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { accounts: 1, transactions: 1 });
});

test("pluggy-sync devolve 500 e a mensagem quando a Pluggy falha", async () => {
  instalaSupabaseFalso();
  instalaFetch({ auth: { ok: false, status: 500, text: async () => "indisponível" } });
  const { sync } = carrega();
  const res = mkRes();
  await sync({ query: { key: "s3cr3t" } }, res);
  assert.equal(res.code, 500);
  assert.match(String(res.body), /indisponível/);
});

/* ---------- webhook ---------- */

test("webhook recusa método diferente de POST", async () => {
  instalaSupabaseFalso(); instalaFetch();
  const { hook } = carrega();
  for (const method of ["GET", "PUT", "DELETE"]) {
    const res = mkRes();
    await hook({ method, headers: {} }, res);
    assert.equal(res.code, 405, method);
  }
});

test("webhook exige o segredo combinado", async () => {
  instalaSupabaseFalso(); instalaFetch();
  const { hook } = carrega();
  for (const headers of [{}, { "x-webhook-secret": "" }, { "x-webhook-secret": "errado" }]) {
    const res = mkRes();
    await hook({ method: "POST", headers, body: {} }, res);
    assert.equal(res.code, 403);
  }
});

test("webhook ignora evento que não interessa, sem sincronizar", async () => {
  const chamadas = instalaSupabaseFalso();
  instalaFetch({ pages: [{ results: [{ id: "a", type: "DEBIT", amount: 1, date: "2026-10-05", description: "X" }], next: null }] });
  const { hook } = carrega();
  const res = mkRes();
  await hook({ method: "POST", headers: { "x-webhook-secret": "wh00k" }, body: { event: "payment_intent/completed" } }, res);
  assert.equal(res.code, 200);
  assert.match(String(res.body), /ignorado/);
  assert.equal(chamadas.length, 0, "não pode ter gravado nada");
});

test("webhook sincroniza nos eventos relevantes", async () => {
  for (const event of ["item/updated", "transactions/created", "transactions/updated"]) {
    instalaSupabaseFalso();
    instalaFetch({ pages: [{ results: [{ id: "a", type: "DEBIT", amount: 1, date: "2026-10-05", description: "X" }], next: null }] });
    const { hook } = carrega();
    const res = mkRes();
    await hook({ method: "POST", headers: { "x-webhook-secret": "wh00k" }, body: { event } }, res);
    assert.equal(res.code, 200, event);
    assert.deepEqual(res.body, { accounts: 1, transactions: 1 }, event);
  }
});

test("corpo malformado não impede o sync: o payload é só gatilho", async () => {
  /* Os dados nunca vêm do webhook — ele só avisa que há o que buscar. */
  instalaSupabaseFalso();
  instalaFetch({ pages: [{ results: [{ id: "a", type: "DEBIT", amount: 1, date: "2026-10-05", description: "X" }], next: null }] });
  const { hook } = carrega();
  const res = mkRes();
  await hook({
    method: "POST", headers: { "x-webhook-secret": "wh00k" },
    get body() { throw new Error("JSON malformado"); }
  }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { accounts: 1, transactions: 1 });
});

test("webhook nunca usa dado vindo do corpo como transação", async () => {
  /* Mesmo quem souber o segredo não consegue injetar lançamento falso. */
  const chamadas = instalaSupabaseFalso();
  instalaFetch({ pages: [{ results: [{ id: "real", type: "DEBIT", amount: 1, date: "2026-10-05", description: "Verdadeira" }], next: null }] });
  const { hook } = carrega();
  const res = mkRes();
  await hook({
    method: "POST", headers: { "x-webhook-secret": "wh00k" },
    body: { event: "transactions/created", transactions: [{ id: "forjada", amount: 999999, description: "Injetada" }] }
  }, res);
  assert.equal(res.code, 200);
  const ids = chamadas[0].linhas.map(l => l.transaction_id);
  assert.deepEqual(ids, ["real"], "só o que veio da API da Pluggy");
});

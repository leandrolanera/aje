"use strict";
/*
 * Botão "Sincronizar agora" e a autenticação por sessão que ele usa.
 *
 * O ponto delicado: o segredo do endpoint não pode ir para o navegador
 * (`config.js` é público), então o botão se autentica com a sessão do
 * Supabase. Os testes aqui existem para que ninguém "simplifique" isso
 * depois colocando o segredo no cliente.
 */
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadApp } = require("./load-app.js");

/* ---------- servidor ---------- */

const SYNC = path.join(__dirname, "..", "api", "pluggy-sync.js");
const envOriginal = { ...process.env };
const fetchOriginal = global.fetch;

function mkRes() {
  const r = { code: 0, body: null };
  r.status = c => { r.code = c; return r; };
  r.send = b => { r.body = b; return r; };
  r.json = o => { r.body = o; return r; };
  return r;
}

/* Dublê do supabase-js: `getUser` decide se o token vale e de quem é. */
function instalaSupabase({ usuario = null, erro = null } = {}) {
  const upserts = [];
  require.cache[require.resolve("@supabase/supabase-js", { paths: [path.dirname(SYNC)] })] = {
    id: "x", filename: "x", loaded: true,
    exports: {
      createClient: () => ({
        auth: { getUser: async () => erro ? { data: null, error: erro } : { data: { user: usuario }, error: null } },
        from: () => ({ upsert: async linhas => { upserts.push(linhas); return { error: null }; } })
      })
    }
  };
  return upserts;
}
function instalaFetch() {
  global.fetch = async url => {
    const u = String(url);
    if (u.includes("/auth")) return { ok: true, json: async () => ({ apiKey: "k" }) };
    if (u.includes("/accounts")) return { ok: true, json: async () => ({ results: [{ id: "acc1", type: "CREDIT" }] }) };
    return { ok: true, json: async () => ({ results: [{ id: "t1", type: "DEBIT", amount: 10, date: "2026-10-15", description: "X" }], next: null }) };
  };
}
function carrega() {
  delete require.cache[require.resolve(SYNC)];
  return require(SYNC);
}

beforeEach(() => {
  process.env.PLUGGY_SYNC_SECRET = "segredo-cli";
  process.env.AJE_USER_ID = "dono";
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.PLUGGY_ITEM_ID = "item-1";
  process.env.PLUGGY_CLIENT_ID = "cid";
  process.env.PLUGGY_CLIENT_SECRET = "csec";
});
afterEach(() => { process.env = { ...envOriginal }; global.fetch = fetchOriginal; });

test("a chave em query continua valendo, para curl e scripts", async () => {
  instalaSupabase(); instalaFetch();
  const res = mkRes();
  await carrega()({ query: { key: "segredo-cli" }, headers: {} }, res);
  assert.equal(res.code, 200);
});

test("sessão válida do dono autoriza, sem precisar do segredo", async () => {
  instalaSupabase({ usuario: { id: "dono" } }); instalaFetch();
  const res = mkRes();
  await carrega()({ query: {}, headers: { authorization: "Bearer token-bom" } }, res);
  assert.equal(res.code, 200);
  assert.ok(res.body.transactions >= 0);
});

test("sessão de OUTRO usuário é recusada", async () => {
  /* O app é de uso pessoal: token válido do Supabase não basta, tem que ser
     o dono deste AJÉ. */
  instalaSupabase({ usuario: { id: "estranho" } }); instalaFetch();
  const res = mkRes();
  await carrega()({ query: {}, headers: { authorization: "Bearer token-de-outro" } }, res);
  assert.equal(res.code, 403);
});

test("token inválido é recusado", async () => {
  instalaSupabase({ erro: new Error("jwt expired") }); instalaFetch();
  const res = mkRes();
  await carrega()({ query: {}, headers: { authorization: "Bearer expirado" } }, res);
  assert.equal(res.code, 403);
});

test("header malformado ou ausente é recusado", async () => {
  instalaSupabase({ usuario: { id: "dono" } }); instalaFetch();
  for (const headers of [{}, { authorization: "token-cru" }, { authorization: "Bearer " }, { authorization: "Basic abc" }]) {
    const res = mkRes();
    await carrega()({ query: {}, headers }, res);
    assert.equal(res.code, 403, JSON.stringify(headers));
  }
});

test("chave errada não passa nem com header ausente", async () => {
  instalaSupabase(); instalaFetch();
  const res = mkRes();
  await carrega()({ query: { key: "chute" }, headers: {} }, res);
  assert.equal(res.code, 403);
});

/* ---------- cliente ---------- */

function appLogado(respostaFetch) {
  const supabase = {
    auth: {
      onAuthStateChange() {},
      getSession: async () => ({ data: { session: { access_token: "tok-123" } } })
    },
    from: () => ({ select: () => ({ eq: () => ({
      order: () => ({ range: async () => ({ data: [], error: null }),
        limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
    }) }) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {}
  };
  const a = loadApp({ supabase });
  a.seedEstado([], [
    { id: "cc", nome: "Conta corrente", saldoInicial: 0, cor: "#1F7A78" },
    { id: "nubank", nome: "Nubank", saldoInicial: 0, cor: "#820AD1" }
  ]);
  a.set("authUser", { id: "dono", email: "eu@exemplo.com", identities: [] });
  const chamadas = [];
  global.fetch = async (url, opts) => { chamadas.push({ url, opts }); return respostaFetch(); };
  return { a, chamadas };
}

test("o botão só aparece no cartão do Nubank, e só logado", () => {
  const { a } = appLogado(() => ({ ok: true, json: async () => ({ transactions: 1 }) }));
  const html = a.viewContas();
  assert.equal((html.match(/data-act="sincronizar"/g) || []).length, 1, "um botão, não um por conta");

  a.set("authUser", null);
  assert.ok(!a.viewContas().includes('data-act="sincronizar"'), "deslogado não tem como autenticar");
});

test("o botão manda a sessão no header, nunca o segredo", async () => {
  const { a, chamadas } = appLogado(() => ({ ok: true, json: async () => ({ transactions: 7 }) }));
  const botao = { textContent: "Sincronizar agora", disabled: false };
  await a.H.sincronizar(botao);

  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, "/api/pluggy-sync");
  assert.equal(chamadas[0].opts.headers.Authorization, "Bearer tok-123");
  assert.ok(!String(chamadas[0].url).includes("key="), "o segredo não pode trafegar pelo cliente");
});

test("o botão volta ao normal mesmo quando o servidor recusa", async () => {
  const { a } = appLogado(() => ({ ok: false, text: async () => "Não autorizado" }));
  const botao = { textContent: "Sincronizar agora", disabled: false };
  await a.H.sincronizar(botao);
  assert.equal(botao.disabled, false, "não pode ficar travado após erro");
  assert.equal(botao.textContent, "Sincronizar agora");
});

test("o botão aguenta a rede cair", async () => {
  const { a } = appLogado(() => { throw new Error("offline"); });
  const botao = { textContent: "Sincronizar agora", disabled: false };
  await assert.doesNotReject(() => a.H.sincronizar(botao));
  assert.equal(botao.disabled, false);
});

test("sem sessão o botão avisa em vez de chamar o servidor", async () => {
  const { a, chamadas } = appLogado(() => ({ ok: true, json: async () => ({}) }));
  a.set("authUser", null);
  await a.H.sincronizar({ textContent: "x", disabled: false });
  assert.equal(chamadas.length, 0);
});

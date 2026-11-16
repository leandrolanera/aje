"use strict";
/*
 * Briefing no Telegram, disparado pelo cron do Vercel.
 *
 * Nada aqui toca a rede nem o Supabase: `fetch` e o cliente são dublês que
 * registram as chamadas. O que importa verificar é que a mensagem sai com o
 * texto do `core.js` e que a falha é ruidosa — o Vercel não repete cron, e um
 * briefing que some em silêncio é indistinguível de um dia sem novidade.
 */
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const BRIEF = path.join(__dirname, "..", "api", "briefing.js");
const ESTADO = path.join(__dirname, "..", "api", "_estado.js");
const envOriginal = { ...process.env };
const fetchOriginal = global.fetch;

function mkRes() {
  const r = { code: 0, body: null };
  r.status = c => { r.code = c; return r; };
  r.send = b => { r.body = b; return r; };
  r.json = o => { r.body = o; return r; };
  return r;
}

const estadoExemplo = {
  v: 1, rev: 1, sample: false, tetoSemanal: 63500,
  accounts: [
    { id: "cc", nome: "Conta corrente", saldoInicial: 100000, cor: "#1F7A78" },
    { id: "nubank", nome: "Nubank", saldoInicial: 0, cor: "#820AD1" }
  ],
  categories: [{ id: "out", nome: "Outras", tipo: "d", cor: "#7A7469" }],
  tx: [{ id: "m1", data: "2026-11-01", desc: "Aluguel", valor: 50000,
         tipo: "d", cat: "out", conta: "cc", ok: true }]
};

function instalaSupabase({ appState = estadoExemplo, linhas = [], erro = null } = {}) {
  let pagina = 0;
  require.cache[require.resolve("@supabase/supabase-js", { paths: [path.dirname(BRIEF)] })] = {
    id: "x", filename: "x", loaded: true,
    exports: {
      createClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => erro ? { data: null, error: erro }
                : { data: appState ? { data: appState } : null, error: null },
              order: () => ({ range: async () => {
                const todas = pagina === 0 ? linhas : [];
                pagina++;
                return { data: todas, error: null };
              } })
            })
          })
        })
      })
    }
  };
}

/* Dublê do Telegram: guarda o que foi postado. */
function instalaTelegram({ ok = true, status = 200, corpo = "{\"ok\":true}" } = {}) {
  const chamadas = [];
  global.fetch = async (url, opts) => {
    chamadas.push({ url: String(url), body: JSON.parse(opts.body) });
    return { ok, status, text: async () => corpo };
  };
  return chamadas;
}

function carrega() {
  for (const p of [BRIEF, ESTADO]) delete require.cache[require.resolve(p)];
  return require(BRIEF);
}

beforeEach(() => {
  process.env.CRON_SECRET = "s3gr3d0-do-cron";
  process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
  process.env.TELEGRAM_CHAT_ID = "999";
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.AJE_USER_ID = "u1";
});
afterEach(() => { process.env = { ...envOriginal }; global.fetch = fetchOriginal; });

const req = autorizacao => ({ headers: { authorization: autorizacao } });
const BOM = "Bearer s3gr3d0-do-cron";

/* ---------- guarda ---------- */

test("sem autorização recusa e não manda nada", async () => {
  instalaSupabase();
  const tg = instalaTelegram();
  const res = mkRes();
  await carrega()({ headers: {} }, res);
  assert.equal(res.code, 401);
  assert.equal(tg.length, 0);
});

test("segredo não configurado recusa, inclusive chave vazia", async () => {
  delete process.env.CRON_SECRET;
  instalaSupabase(); instalaTelegram();
  for (const h of ["", "Bearer ", "Bearer qualquer"]) {
    const res = mkRes();
    await carrega()(req(h), res);
    assert.equal(res.code, 401, "autorização " + JSON.stringify(h));
  }
});

/* ---------- envio ---------- */

test("manda o texto do core.js para o chat configurado", async () => {
  instalaSupabase();
  const tg = instalaTelegram();
  const res = mkRes();
  await carrega()(req(BOM), res);

  assert.equal(res.code, 200);
  assert.equal(res.body.enviado, true);
  assert.equal(tg.length, 1);
  assert.match(tg[0].url, /^https:\/\/api\.telegram\.org\/bot123:ABC\/sendMessage$/);
  assert.equal(tg[0].body.chat_id, "999");
  assert.match(tg[0].body.text, /^AJÉ — \d{2}\/\d{2}/, "cabeçalho com a data");
  /* O texto é o do core.js — a garantia de que o Telegram e o app mostram o
     mesmo número é não haver segunda formatação. */
  assert.match(tg[0].body.text, /Menor saldo previsto|saldo fica negativo/);
});

test("sem estado gravado não manda mensagem vazia", async () => {
  /* Mensagem diária sem assunto é ruído, e ruído diário é o que faz parar de
     ler. 200 porque não ter estado não é erro. */
  instalaSupabase({ appState: null });
  const tg = instalaTelegram();
  const res = mkRes();
  await carrega()(req(BOM), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.enviado, false);
  assert.equal(tg.length, 0);
});

/* ---------- falhas são ruidosas ---------- */

test("erro do Telegram vira 500 com o motivo", async () => {
  instalaSupabase();
  instalaTelegram({ ok: false, status: 400, corpo: '{"description":"chat not found"}' });
  const silencio = console.error; console.error = () => {};
  try {
    const res = mkRes();
    await carrega()(req(BOM), res);
    assert.equal(res.code, 500);
    assert.match(res.body, /400/);
    assert.match(res.body, /chat not found/, "o motivo do Telegram chega ao log");
  } finally { console.error = silencio; }
});

test("erro do banco vira 500", async () => {
  instalaSupabase({ erro: new Error("sem conexão") });
  instalaTelegram();
  const silencio = console.error; console.error = () => {};
  try {
    const res = mkRes();
    await carrega()(req(BOM), res);
    assert.equal(res.code, 500);
  } finally { console.error = silencio; }
});

test("token ou chat ausente vira 500, não silêncio", async () => {
  /* Variável esquecida no painel some com o briefing sem aviso nenhum. */
  delete process.env.TELEGRAM_CHAT_ID;
  instalaSupabase();
  const tg = instalaTelegram();
  const silencio = console.error; console.error = () => {};
  try {
    const res = mkRes();
    await carrega()(req(BOM), res);
    assert.equal(res.code, 500);
    assert.match(res.body, /TELEGRAM_CHAT_ID/);
    assert.equal(tg.length, 0);
  } finally { console.error = silencio; }
});

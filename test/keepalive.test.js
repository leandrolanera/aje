"use strict";
/*
 * Keepalive: o endpoint que impede o Supabase de pausar o projeto.
 *
 * O teste que importa aqui não é o do status, é o de que ele CONSULTA O
 * BANCO. Um handler que devolvesse 200 sem tocar no Supabase passaria num
 * teste de status e falharia no mundo: a atividade que evita a pausa é
 * consulta ao banco, não requisição ao Vercel.
 */
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const KEEP = path.join(__dirname, "..", "api", "keepalive.js");
const envOriginal = { ...process.env };

function mkRes() {
  const r = { code: 0, body: null };
  r.status = c => { r.code = c; return r; };
  r.send = b => { r.body = b; return r; };
  r.json = o => { r.body = o; return r; };
  return r;
}

/* Dublê do supabase-js que registra as consultas feitas. */
function instalaSupabase({ erro = null } = {}) {
  const consultas = [];
  require.cache[require.resolve("@supabase/supabase-js", { paths: [path.dirname(KEEP)] })] = {
    id: "x", filename: "x", loaded: true,
    exports: {
      createClient: () => ({
        from: tabela => ({
          select: colunas => ({
            limit: async n => {
              consultas.push({ tabela, colunas, n });
              return { data: erro ? null : [], error: erro };
            }
          })
        })
      })
    }
  };
  return consultas;
}
function carrega() {
  delete require.cache[require.resolve(KEEP)];
  return require(KEEP);
}

beforeEach(() => {
  process.env.CRON_SECRET = "s3gr3d0-do-cron";
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
});
afterEach(() => { process.env = { ...envOriginal }; });

const req = autorizacao => ({ headers: { authorization: autorizacao } });

test("sem cabeçalho de autorização recusa", async () => {
  instalaSupabase();
  const res = mkRes();
  await carrega()({ headers: {} }, res);
  assert.equal(res.code, 401);
});

test("chave errada recusa sem nem tocar no banco", async () => {
  const consultas = instalaSupabase();
  const res = mkRes();
  await carrega()(req("Bearer errado"), res);
  assert.equal(res.code, 401);
  assert.equal(consultas.length, 0);
});

test("segredo não configurado recusa, inclusive chave vazia", async () => {
  /* Esquecer a variável no painel não pode deixar o endpoint aberto. */
  delete process.env.CRON_SECRET;
  instalaSupabase();
  for (const h of ["", "Bearer ", "Bearer qualquer"]) {
    const res = mkRes();
    await carrega()(req(h), res);
    assert.equal(res.code, 401, `deveria recusar com autorização ${JSON.stringify(h)}`);
  }
});

test("com a chave certa, consulta o banco de verdade", async () => {
  const consultas = instalaSupabase();
  const res = mkRes();
  await carrega()(req("Bearer s3gr3d0-do-cron"), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
  /* A razão de existir do endpoint: 200 sem consulta deixaria o cron verde
     enquanto o projeto pausava do mesmo jeito. */
  assert.equal(consultas.length, 1, "precisa consultar, não só responder");
  assert.equal(consultas[0].tabela, "app_state");
});

test("erro do banco vira 500, não 200", async () => {
  /* O Vercel não repete invocação de cron: o 500 no log é o único aviso de
     que o banco parou de responder e a pausa voltou a correr. Engolir o erro
     faria deste endpoint um alarme que nunca toca. */
  instalaSupabase({ erro: new Error("sem conexão") });
  const silencio = console.error;
  console.error = () => {};
  try {
    const res = mkRes();
    await carrega()(req("Bearer s3gr3d0-do-cron"), res);
    assert.equal(res.code, 500);
  } finally {
    console.error = silencio;
  }
});

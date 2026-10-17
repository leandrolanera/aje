"use strict";
/*
 * Resumo diário: a conta que vai virar mensagem no Telegram.
 *
 * O caso que define o desenho é o do "menor saldo": com a fatura vencendo no
 * dia 24, o saldo mergulha no meio do mês e volta a subir com o salário.
 * Dividir o saldo do ÚLTIMO dia deixaria gastar dinheiro que não existe no
 * dia 24 — por isso a conta usa o ponto mais baixo.
 */
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Core = require("../core.js");

function estado(tx, contas) {
  return {
    v: 1, rev: 1, sample: false,
    accounts: contas || [
      { id: "cc", nome: "Conta corrente", saldoInicial: 100000, cor: "#1F7A78" },
      { id: "nubank", nome: "Nubank", saldoInicial: 0, cor: "#820AD1" }
    ],
    categories: [{ id: "out", nome: "Outras despesas", tipo: "d", cor: "#7A7469" }],
    tx: tx || []
  };
}
function manual(o) {
  return Object.assign({ id: "m" + Math.random(), data: "2026-10-10", desc: "Manual",
    valor: 1000, tipo: "d", cat: "out", conta: "cc", ok: true }, o);
}
function imp(o) {
  return Object.assign({ id: "pg-" + Math.random(), data: "2026-10-10", desc: "Compra",
    valor: 1000, tipo: "d", cat: "out", conta: "nubank", ok: true, imported: true,
    fatura: null, pagamento: false }, o);
}

/* ---------- gastos de ontem ---------- */

test("soma os gastos de ontem juntando cartão e lançamento manual", () => {
  const S = estado([manual({ data: "2026-10-14", valor: 3000, desc: "Feira" })]);
  const pg = [imp({ data: "2026-10-14", valor: 4590, desc: "iFood", fatura: "2026-10" })];
  const r = Core.resumoDiario(S, pg, "2026-10-15");
  assert.equal(r.ontem, "2026-10-14");
  assert.equal(r.gastos, 7590, "os dois entram");
  assert.deepEqual(r.itens.map(i => i.desc), ["iFood", "Feira"], "ordenado do maior para o menor");
});

test("conta a compra do dia dela, não o agregado da fatura", () => {
  /* A fatura cai no vencimento (24); o gasto aconteceu no dia 14. Usar o
     agregado diria "você gastou tudo no dia 24". */
  const S = estado([manual({ data: "2026-01-01", valor: 1 })]);
  const pg = [imp({ data: "2026-10-14", valor: 4590, fatura: "2026-10" })];
  assert.equal(Core.resumoDiario(S, pg, "2026-10-15").gastos, 4590);
  assert.equal(Core.resumoDiario(S, pg, "2026-10-25").gastos, 0, "no dia 25 não há gasto de ontem");
});

test("receita de ontem não entra nos gastos", () => {
  const S = estado([
    manual({ data: "2026-10-14", valor: 500000, tipo: "r", desc: "Salário" }),
    manual({ data: "2026-10-14", valor: 3000, tipo: "d", desc: "Feira" })
  ]);
  const r = Core.resumoDiario(S, [], "2026-10-15");
  assert.equal(r.gastos, 3000);
  assert.deepEqual(r.itens.map(i => i.desc), ["Feira"]);
});

test("pagamento de fatura não conta como gasto do dia", () => {
  /* Já é o outro lado do lançamento da fatura; contar seria dobrar. */
  const S = estado([manual({ data: "2026-01-01", valor: 1 })]);
  const pg = [imp({ data: "2026-10-14", valor: 189666, tipo: "r",
    desc: "Pagamento recebido", pagamento: true })];
  assert.equal(Core.resumoDiario(S, pg, "2026-10-15").gastos, 0);
});

test("dia sem gasto nenhum devolve zero e lista vazia", () => {
  const r = Core.resumoDiario(estado([manual({ data: "2026-01-01" })]), [], "2026-10-15");
  assert.equal(r.gastos, 0);
  assert.deepEqual(r.itens, []);
});

test("ontem no mês anterior é tratado normalmente", () => {
  /* No dia 1º, "ontem" é o último dia do mês passado. */
  const S = estado([manual({ data: "2026-09-30", valor: 7000, desc: "Último de setembro" })]);
  const r = Core.resumoDiario(S, [], "2026-10-01");
  assert.equal(r.ontem, "2026-09-30");
  assert.equal(r.gastos, 7000);
});

test("ontem na virada do ano", () => {
  const S = estado([manual({ data: "2026-12-31", valor: 5000 })]);
  const r = Core.resumoDiario(S, [], "2027-01-01");
  assert.equal(r.ontem, "2026-12-31");
  assert.equal(r.gastos, 5000);
});

/* ---------- menor saldo e orçamento semanal ---------- */

test("o menor saldo cai no dia da fatura, não no fim do mês", () => {
  /* Saldo 1.000; fatura de 600 vence dia 24; salário de 500 entra dia 28.
     Fim do mês = 900, mas o ponto mais baixo é 400 no dia 24. */
  const S = estado([
    manual({ data: "2026-10-01", valor: 0, desc: "marco inicial" }),
    manual({ data: "2026-10-28", valor: 50000, tipo: "r", desc: "Salário" })
  ]);
  const pg = [imp({ data: "2026-10-10", valor: 60000, fatura: "2026-10" })];
  const r = Core.resumoDiario(S, pg, "2026-10-05");
  assert.equal(r.menorSaldoEm, "2026-10-24");
  assert.equal(r.menorSaldo, 40000);
  assert.equal(r.saldoFimDoMes, 90000, "o fim do mês é maior — por isso não serve de base");
  assert.ok(r.porSemana < r.saldoFimDoMes / r.semanasRestantes, "o orçamento usa o vale, não o fim");
});

test("o que já passou no mês não limita o que falta", () => {
  /* Uma despesa pesada no dia 2 não pode continuar puxando o mínimo para
     baixo quando já estamos no dia 20. */
  const S = estado([
    manual({ data: "2026-10-02", valor: 90000, desc: "Despesa velha" }),
    manual({ data: "2026-10-20", valor: 1000, desc: "Hoje" })
  ]);
  const r = Core.resumoDiario(S, [], "2026-10-20");
  assert.ok(r.menorSaldo >= 0, "o saldo já absorveu a despesa do dia 2");
  assert.ok(r.menorSaldoEm >= "2026-10-20");
});

test("semanas restantes e valor por semana", () => {
  const S = estado([manual({ data: "2026-10-01", valor: 0 })]);
  const r = Core.resumoDiario(S, [], "2026-10-25");
  assert.equal(r.diasRestantes, 7, "do dia 25 ao 31");
  assert.equal(r.semanasRestantes, 1);
  assert.equal(r.porSemana, r.menorSaldo, "com uma semana, o orçamento é o saldo inteiro");
});

test("no último dia do mês ainda sobra uma semana, nunca zero", () => {
  /* Dividir por zero daria Infinity no orçamento. */
  const S = estado([manual({ data: "2026-10-01", valor: 0 })]);
  const r = Core.resumoDiario(S, [], "2026-10-31");
  assert.equal(r.diasRestantes, 1);
  assert.equal(r.semanasRestantes, 1);
  assert.ok(Number.isFinite(r.porSemana));
});

test("saldo negativo vira aviso de rombo, não orçamento negativo", () => {
  const S = estado([manual({ data: "2026-10-20", valor: 200000, desc: "Despesa grande" })]);
  const r = Core.resumoDiario(S, [], "2026-10-15");
  assert.equal(r.vermelho, true);
  assert.ok(r.menorSaldo < 0);
  assert.equal(r.porSemana, 0, "não existe 'pode gastar' negativo");
});

test("o orçamento é arredondado para baixo", () => {
  const S = estado([manual({ data: "2026-10-01", valor: 0 })],
    [{ id: "cc", nome: "CC", saldoInicial: 10000, cor: "#111111" }]);
  const r = Core.resumoDiario(S, [], "2026-10-04");
  assert.equal(r.porSemana, Math.floor(r.menorSaldo / r.semanasRestantes),
    "centavo a mais no orçamento é centavo que falta no fim");
});

test("considera todas as contas somadas", () => {
  const S = estado([manual({ data: "2026-10-01", valor: 0 })], [
    { id: "cc", nome: "CC", saldoInicial: 50000, cor: "#111111" },
    { id: "poup", nome: "Poupança", saldoInicial: 70000, cor: "#222222" }
  ]);
  assert.equal(Core.resumoDiario(S, [], "2026-10-10").menorSaldo, 120000);
});

/* ---------- texto ---------- */

test("o texto diz o gasto, os maiores itens e o orçamento", () => {
  const S = estado([
    manual({ data: "2026-10-14", valor: 3000, desc: "Feira" }),
    manual({ data: "2026-10-01", valor: 0 })
  ]);
  const t = Core.resumoTexto(Core.resumoDiario(S, [], "2026-10-15"));
  /* `Intl` separa "R$" do número com espaço NÃO separável (U+00A0), não com
     espaço comum — por isso `\s` e não " " nas comparações. */
  assert.match(t, /Ontem você gastou R\$\s30,00/);
  assert.match(t, /• Feira — R\$\s30,00/);
  assert.match(t, /Dá para gastar R\$\s.* por semana/);
  assert.match(t, /Menor saldo previsto/);
});

test("o texto avisa quando não houve gasto", () => {
  const t = Core.resumoTexto(Core.resumoDiario(estado([manual({ data: "2026-01-01" })]), [], "2026-10-15"));
  assert.match(t, /não houve gasto/i);
});

test("o texto troca o orçamento pelo aviso quando o saldo fica negativo", () => {
  const S = estado([manual({ data: "2026-10-20", valor: 200000 })]);
  const t = Core.resumoTexto(Core.resumoDiario(S, [], "2026-10-15"));
  assert.match(t, /Atenção.*negativo/);
  assert.ok(!t.includes("Dá para gastar"), "não faz sentido sugerir gasto no vermelho");
});

test("o texto lista no máximo três itens", () => {
  const tx = [manual({ data: "2026-10-01", valor: 0 })];
  for (let i = 0; i < 8; i++) tx.push(manual({ data: "2026-10-14", valor: 1000 + i, desc: "Item " + i }));
  const t = Core.resumoTexto(Core.resumoDiario(estado(tx), [], "2026-10-15"));
  assert.equal((t.match(/^• /gm) || []).length, 3, "a mensagem não pode virar um extrato");
});

/* ---------- endpoint ---------- */

const RESUMO = path.join(__dirname, "..", "api", "resumo.js");
const envOriginal = { ...process.env };

function mkRes() {
  const r = { code: 0, body: null };
  r.status = c => { r.code = c; return r; };
  r.send = b => { r.body = b; return r; };
  r.json = o => { r.body = o; return r; };
  return r;
}
/* Dublê do supabase-js: devolve o app_state e as linhas de pluggy_tx. */
function instalaSupabase({ appState = null, linhas = [], erro = null } = {}) {
  let pagina = 0;
  require.cache[require.resolve("@supabase/supabase-js", { paths: [path.dirname(RESUMO)] })] = {
    id: "x", filename: "x", loaded: true,
    exports: {
      createClient: () => ({
        from: tabela => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => erro ? { data: null, error: erro } : { data: appState, error: null },
              order: () => ({
                range: async () => {
                  const todas = pagina === 0 ? linhas : [];
                  pagina++;
                  return { data: todas, error: null };
                }
              })
            })
          })
        })
      })
    }
  };
}
function carrega() {
  delete require.cache[require.resolve(RESUMO)];
  return require(RESUMO);
}

beforeEach(() => {
  process.env.AJE_RESUMO_SECRET = "s3gr3d0";
  process.env.AJE_USER_ID = "u1";
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
});
afterEach(() => { process.env = { ...envOriginal }; });

test("endpoint recusa sem chave e com chave errada", async () => {
  instalaSupabase();
  const h = carrega();
  for (const query of [{}, { key: "" }, { key: "errada" }]) {
    const res = mkRes();
    await h({ query }, res);
    assert.equal(res.code, 403, JSON.stringify(query));
  }
});

test("endpoint devolve o resumo e o texto pronto", async () => {
  instalaSupabase({
    appState: { data: estado([manual({ data: "2026-10-01", valor: 0 })]) },
    linhas: [{ transaction_id: "11111111-1111-1111-1111-111111111111", date: "2026-10-14",
      description: "iFood", amount_cents: 4590, tipo: "d", status: "POSTED",
      category_pluggy: "Restaurante", fatura: "2026-10" }]
  });
  const res = mkRes();
  await carrega()({ query: { key: "s3gr3d0" } }, res);
  assert.equal(res.code, 200);
  assert.equal(typeof res.body.texto, "string");
  assert.ok(res.body.texto.length > 0);
  assert.ok("menorSaldo" in res.body && "porSemana" in res.body);
});

test("endpoint aplica o dedup de pendentes antes de contar", async () => {
  /* A mesma transação gravada duas vezes (PENDING órfã + POSTED) dobraria o
     gasto do dia na mensagem. */
  const ontem = Core.addDays(Core.todayISO(), -1);
  const linha = (id, status) => ({ transaction_id: id, date: ontem,
    description: "Mercado", amount_cents: 10000, tipo: "d", status,
    category_pluggy: "Supermercado", fatura: ontem.slice(0, 7) });
  instalaSupabase({
    appState: { data: estado([manual({ data: "2020-01-01", valor: 0 })]) },
    linhas: [linha("aaaaaaaa-0000-0000-0000-000000000001", "POSTED"),
             linha("bbbbbbbb-0000-0000-0000-000000000002", "PENDING")]
  });
  const res = mkRes();
  await carrega()({ query: { key: "s3gr3d0" } }, res);
  assert.equal(res.body.gastos, 10000, "a pendente duplicada não pode somar");
});

test("sem estado gravado, o endpoint responde vazio em vez de inventar número", async () => {
  instalaSupabase({ appState: null });
  const res = mkRes();
  await carrega()({ query: { key: "s3gr3d0" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.vazio, true);
  assert.equal(res.body.texto, "");
});

test("erro do banco vira 500 com a mensagem", async () => {
  instalaSupabase({ erro: new Error("RLS negou") });
  const res = mkRes();
  await carrega()({ query: { key: "s3gr3d0" } }, res);
  assert.equal(res.code, 500);
  assert.match(String(res.body), /RLS negou/);
});

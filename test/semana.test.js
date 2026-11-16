"use strict";
/*
 * Contador semanal: quanto já foi gasto no cartão nesta semana.
 *
 * Existe porque comprar só no crédito esconde o custo — ele aparece na fatura
 * 20 a 50 dias depois, quando a decisão já não tem volta. O caso que define o
 * desenho é o do fim de semana em que o teto foi estourado e só se soube dois
 * dias depois, conferindo o extrato.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../core.js");

/* 2026-11-16 é uma segunda-feira; 2026-11-22, o domingo da mesma semana. */
const SEG = "2026-11-16", DOM = "2026-11-22";

function estado(tx, teto) {
  const S = {
    v: 1, rev: 1, sample: false,
    accounts: [
      { id: "cc", nome: "Conta corrente", saldoInicial: 0, cor: "#1F7A78" },
      { id: "nubank", nome: "Nubank", saldoInicial: 0, cor: "#820AD1" }
    ],
    categories: [{ id: "out", nome: "Outras", tipo: "d", cor: "#7A7469" }],
    tx: tx || []
  };
  if (teto !== undefined) S.tetoSemanal = teto;
  return S;
}
function compra(o) {
  return Object.assign({ id: "pg-" + Math.random(), data: SEG, desc: "Compra",
    valor: 1000, tipo: "d", cat: "out", conta: "nubank", ok: true, imported: true,
    fatura: null, pagamento: false }, o);
}

/* ---------- o que entra na conta ---------- */

test("soma as compras do cartão na semana corrente", () => {
  const pg = [compra({ valor: 30000 }), compra({ data: "2026-11-18", valor: 42900 })];
  const r = Core.gastoDaSemana(estado([], 63500), pg, "2026-11-18");
  assert.equal(r.gasto, 72900);
  assert.equal(r.de, SEG);
  assert.equal(r.ate, DOM);
});

test("a semana vai de segunda a domingo, qualquer que seja o dia de hoje", () => {
  for (const hoje of [SEG, "2026-11-18", DOM]) {
    const r = Core.gastoDaSemana(estado(), [], hoje);
    assert.equal(r.de, SEG, "segunda de " + hoje);
    assert.equal(r.ate, DOM, "domingo de " + hoje);
  }
  /* A segunda seguinte abre semana nova — é o ponto de reinício que torna
     "quanto ainda posso gastar" uma pergunta respondível. */
  assert.equal(Core.gastoDaSemana(estado(), [], "2026-11-23").de, "2026-11-23");
});

test("compra de outra semana não entra", () => {
  const pg = [compra({ data: "2026-11-15" }), compra({ data: "2026-11-23" })];
  assert.equal(Core.gastoDaSemana(estado(), pg, "2026-11-18").gasto, 0);
});

/* ---------- o que fica de fora ---------- */

test("pagar a fatura não é gastar", () => {
  /* As compras já foram contadas no dia de cada uma. Mesma regra do resumo
     diário: contar a liquidação de novo dobraria o gasto. */
  const pg = [compra({ valor: 5000 }),
    compra({ valor: 66000, tipo: "r", desc: "Pagamento recebido", pagamento: true })];
  const S = estado([{ id: "m1", data: SEG, desc: "Fatura Nubank", valor: 66000,
    tipo: "d", cat: "car", conta: "cc", ok: true }]);
  assert.equal(Core.gastoDaSemana(S, pg, "2026-11-18").gasto, 5000);
});

test("conta fixa da conta corrente não entra", () => {
  /* O teto é de consumo no cartão. AP, condomínio e luz saem da conta
     corrente e têm orçamento próprio — contá-los tornaria o teto inútil. */
  const S = estado([
    { id: "m1", data: SEG, desc: "AP", valor: 180000, tipo: "d", cat: "mor", conta: "cc", ok: true },
    { id: "m2", data: SEG, desc: "Condomínio", valor: 60000, tipo: "d", cat: "mor", conta: "cc", ok: true }
  ]);
  assert.equal(Core.gastoDaSemana(S, [], "2026-11-18").gasto, 0);
});

test("estorno no cartão não vira gasto", () => {
  const pg = [compra({ valor: 10000 }), compra({ valor: 4000, tipo: "r", desc: "Estorno" })];
  assert.equal(Core.gastoDaSemana(estado(), pg, "2026-11-18").gasto, 10000);
});

/* ---------- o teto ---------- */

test("com teto, diz quanto resta", () => {
  const pg = [compra({ valor: 42000 })];
  const r = Core.gastoDaSemana(estado([], 63500), pg, "2026-11-18");
  assert.equal(r.resta, 21500);
  assert.equal(r.estourou, false);
});

test("estourado, diz quanto passou", () => {
  const pg = [compra({ valor: 72900 })];
  const r = Core.gastoDaSemana(estado([], 63500), pg, "2026-11-18");
  assert.equal(r.estourou, true);
  assert.equal(r.resta, -9400);
});

test("sem teto configurado, informa sem julgar", () => {
  /* O teto muda conforme a dívida encolhe, então mora no estado e não no
     código. Quem ainda não definiu um continua vendo o gasto. */
  const r = Core.gastoDaSemana(estado(), [compra({ valor: 5000 })], "2026-11-18");
  assert.equal(r.gasto, 5000);
  assert.equal(r.teto, 0);
  assert.equal(r.resta, null);
  assert.equal(r.estourou, false);
});

/* ---------- no texto do briefing ---------- */

test("o texto do resumo mostra a semana e o que resta", () => {
  const S = estado([{ id: "m0", data: "2026-11-01", desc: "marco", valor: 0,
    tipo: "d", cat: "out", conta: "cc", ok: true }], 63500);
  const pg = [compra({ valor: 42000 })];
  const t = Core.resumoTexto(Core.resumoDiario(S, pg, "2026-11-18"));
  assert.match(t, /Semana \(16\/11 a 22\/11\): R\$\s420,00 de R\$\s635,00/);
  assert.match(t, /restam R\$\s215,00/);
});

test("o período aparece mesmo sem teto configurado", () => {
  /* Chegando todo dia, a mensagem precisa dizer de que semana fala: na
     segunda, zero é semana nova; no domingo, é semana sem gasto. */
  const S = estado([{ id: "m0", data: "2026-11-01", desc: "marco", valor: 0,
    tipo: "d", cat: "out", conta: "cc", ok: true }]);
  const t = Core.resumoTexto(Core.resumoDiario(S, [compra({ valor: 5000 })], "2026-11-18"));
  assert.match(t, /Semana \(16\/11 a 22\/11\): R\$\s50,00 no cartão\./);
});

test("estourado, o texto avisa em vez de dizer quanto resta", () => {
  const S = estado([{ id: "m0", data: "2026-11-01", desc: "marco", valor: 0,
    tipo: "d", cat: "out", conta: "cc", ok: true }], 63500);
  const pg = [compra({ valor: 72900 })];
  const t = Core.resumoTexto(Core.resumoDiario(S, pg, "2026-11-18"));
  assert.match(t, /estourou R\$\s94,00/);
  assert.ok(!/restam/.test(t), "não faz sentido falar em resto depois de estourar");
});

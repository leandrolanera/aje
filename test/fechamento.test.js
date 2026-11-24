"use strict";
/*
 * Fechamento da semana encerrada, no briefing de segunda-feira.
 *
 * O contador diário responde "quanto ainda posso gastar". Isto responde
 * "como foi" — e a comparação com a semana anterior é o que faz dele um
 * fechamento, não um repeteco: sozinho, um número não diz se melhorou.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../core.js");

/* 2026-11-23 é segunda. A semana encerrada vai de 16/11 a 22/11; a
   anterior, de 09/11 a 15/11. */
const SEGUNDA = "2026-11-23";

function estado(teto) {
  const S = {
    v: 1, rev: 1, sample: false,
    accounts: [
      { id: "cc", nome: "Conta corrente", saldoInicial: 500000, cor: "#1F7A78" },
      { id: "nubank", nome: "Nubank", saldoInicial: 0, cor: "#820AD1" }
    ],
    categories: [
      { id: "mer", nome: "Mercado", tipo: "d", cor: "#111111" },
      { id: "res", nome: "Restaurantes", tipo: "d", cor: "#222222" },
      { id: "out", nome: "Outras despesas", tipo: "d", cor: "#333333" }
    ],
    tx: [{ id: "m0", data: "2026-11-01", desc: "marco", valor: 0,
           tipo: "d", cat: "out", conta: "cc", ok: true }]
  };
  if (teto !== undefined) S.tetoSemanal = teto;
  return S;
}
function compra(o) {
  return Object.assign({ id: "pg-" + Math.random(), data: "2026-11-18", desc: "Compra",
    valor: 1000, tipo: "d", cat: "mer", conta: "nubank", ok: true, imported: true,
    fatura: null, pagamento: false, parcela: null, total: null }, o);
}

/* ---------- quando existe ---------- */

test("só existe na segunda-feira", () => {
  /* Fechamento é evento, não estado. Repetido todo dia vira ruído, e ruído
     diário é o que faz parar de ler. */
  const S = estado(63500);
  assert.ok(Core.fechamentoSemana(S, [], SEGUNDA), "segunda tem");
  for (const dia of ["2026-11-24", "2026-11-26", "2026-11-28", "2026-11-29"]) {
    assert.equal(Core.fechamentoSemana(S, [], dia), null, "não é segunda: " + dia);
  }
});

test("fecha a semana anterior, não a corrente", () => {
  const r = Core.fechamentoSemana(estado(63500), [], SEGUNDA);
  assert.equal(r.de, "2026-11-16");
  assert.equal(r.ate, "2026-11-22");
});

/* ---------- a conta ---------- */

test("soma a semana encerrada e compara com a anterior", () => {
  const pg = [
    compra({ data: "2026-11-18", valor: 40000 }),
    compra({ data: "2026-11-21", valor: 30000 }),
    compra({ data: "2026-11-12", valor: 8516 })   /* semana anterior */
  ];
  const r = Core.fechamentoSemana(estado(63500), pg, SEGUNDA);
  assert.equal(r.gasto, 70000);
  assert.equal(r.gastoAnterior, 8516);
  assert.equal(r.compras, 2);
  assert.equal(r.estourou, true);
  assert.equal(r.resta, -6500);
});

test("a compra da semana corrente não entra", () => {
  /* A semana que começou hoje é assunto do contador, não do fechamento. */
  const pg = [compra({ data: SEGUNDA, valor: 50000 })];
  assert.equal(Core.fechamentoSemana(estado(63500), pg, SEGUNDA).gasto, 0);
});

test("parcela antiga fica de fora, como no contador", () => {
  const pg = [
    compra({ data: "2026-11-18", valor: 10000 }),
    compra({ data: "2026-11-18", valor: 3574, parcela: 10, total: 12 })
  ];
  assert.equal(Core.fechamentoSemana(estado(63500), pg, SEGUNDA).gasto, 10000);
});

test("top 3 por categoria, com o nome que o usuário deu", () => {
  const pg = [
    compra({ data: "2026-11-17", valor: 39500, cat: "mer" }),
    compra({ data: "2026-11-18", valor: 17247, cat: "out" }),
    compra({ data: "2026-11-19", valor: 6561, cat: "res" }),
    compra({ data: "2026-11-20", valor: 100, cat: "res" })
  ];
  const r = Core.fechamentoSemana(estado(63500), pg, SEGUNDA);
  assert.deepEqual(r.categorias.map(c => c.nome), ["Mercado", "Outras despesas", "Restaurantes"]);
  assert.equal(r.categorias[0].valor, 39500);
  assert.equal(r.categorias[2].valor, 6661, "soma as duas de Restaurantes");
});

test("com mais de três categorias, mostra só as três maiores", () => {
  const pg = ["mer", "res", "out", "mer"].map((cat, i) =>
    compra({ data: "2026-11-1" + (7 + i % 3), valor: 1000 * (i + 1), cat }));
  assert.equal(Core.fechamentoSemana(estado(63500), pg, SEGUNDA).categorias.length, 3);
});

/* ---------- no texto ---------- */

test("o texto abre com o fechamento na segunda", () => {
  /* Abre a mensagem porque é o dia em que a informação ainda pode mudar a
     semana que começa; enterrada embaixo do gasto de domingo, não muda. */
  const pg = [
    compra({ data: "2026-11-17", valor: 39500, cat: "mer" }),
    compra({ data: "2026-11-18", valor: 47716, cat: "out" }),
    compra({ data: "2026-11-11", valor: 8516 })
  ];
  const t = Core.resumoTexto(Core.resumoDiario(estado(63500), pg, SEGUNDA));
  const linhas = t.split("\n");
  assert.match(linhas[0], /^Fechamento de 16\/11 a 22\/11$/);
  assert.match(t, /R\$\s872,16 de R\$\s635,00 — estourou R\$\s237,16\./);
  assert.match(t, /• Outras despesas R\$\s477,16 · Mercado R\$\s395,00/);
  assert.match(t, /• 2 compras, R\$\s124,59\/dia · semana anterior: R\$\s85,16/);
});

test("semana dentro do teto diz quanto sobrou", () => {
  const pg = [compra({ data: "2026-11-18", valor: 40000 })];
  const t = Core.resumoTexto(Core.resumoDiario(estado(63500), pg, SEGUNDA));
  assert.match(t, /sobraram R\$\s235,00\./);
  assert.ok(!/estourou/.test(t));
});

test("parcelamento aberto na semana aparece no fechamento", () => {
  const pg = [compra({ data: "2026-11-17", valor: 17247, desc: "Tabacaria", parcela: 1, total: 3 })];
  const t = Core.resumoTexto(Core.resumoDiario(estado(63500), pg, SEGUNDA));
  assert.match(t, /• Parcelamento aberto: Tabacaria em 3× \(R\$\s517,41\)/);
});

test("fora de segunda, o texto não traz fechamento", () => {
  const pg = [compra({ data: "2026-11-18", valor: 40000 })];
  const t = Core.resumoTexto(Core.resumoDiario(estado(63500), pg, "2026-11-25"));
  assert.ok(!/Fechamento/.test(t));
});

test("primeira segunda sem histórico não quebra", () => {
  /* Sem semana anterior, a comparação é contra zero — e tem que sair como
     número, não como "undefined" no meio da mensagem. */
  const r = Core.fechamentoSemana(estado(63500), [], SEGUNDA);
  assert.equal(r.gasto, 0);
  assert.equal(r.gastoAnterior, 0);
  assert.equal(r.porDia, 0);
  assert.deepEqual(r.categorias, []);
  const t = Core.resumoTexto(Core.resumoDiario(estado(63500), [], SEGUNDA));
  assert.ok(!/undefined|NaN/.test(t), "nada de undefined no texto");
});

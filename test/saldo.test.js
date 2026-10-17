"use strict";
/*
 * As três visões sobre os mesmos dados e os cálculos de saldo que dependem
 * delas. O ponto central: compra individual do cartão NÃO entra no saldo (a
 * fatura agregada entra no lugar), mas continua existindo para quem filtra
 * pela conta do cartão e para a exportação.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app.js");

function env(pluggyTx = [], tx = [], contas) {
  const a = loadApp();
  a.seedEstado(tx, contas);
  a.set("pluggyTx", pluggyTx);
  return a;
}
function imp(o) {
  return Object.assign({
    id: "pg-" + Math.random().toString(36).slice(2),
    data: "2026-10-10", desc: "Compra", valor: 1000, tipo: "d", cat: "out",
    conta: "nubank", ok: true, imported: true, fatura: null, pagamento: false
  }, o);
}
function manual(o) {
  return Object.assign({
    id: "m" + Math.random().toString(36).slice(2),
    data: "2026-10-10", desc: "Manual", valor: 1000, tipo: "d", cat: "out",
    conta: "cc", ok: true
  }, o);
}

/* ---------- as três visões ---------- */

test("everyTx entrega os fatos crus: manuais + cada compra do cartão", () => {
  const a = env([imp({ valor: 100 }), imp({ valor: 200 })], [manual({ valor: 300 })]);
  assert.equal(a.everyTx().length, 3);
});

test("allTx troca as compras do cartão pela fatura agregada", () => {
  const a = env(
    [imp({ data: "2026-10-05", valor: 4000, fatura: "2026-10" }),
     imp({ data: "2026-10-06", valor: 6000, fatura: "2026-10" })],
    [manual({ data: "2026-01-01", valor: 300 })]
  );
  const lista = a.allTx();
  assert.equal(lista.length, 2, "1 manual + 1 fatura, não 1 manual + 2 compras");
  const fat = lista.find(t => t.isFatura);
  assert.equal(fat.valor, 10000);
});

test("filtrar pela conta do cartão desagrega: mostra as compras, não a fatura", () => {
  const a = env(
    [imp({ data: "2026-10-05", valor: 4000, fatura: "2026-10" }),
     imp({ data: "2026-10-06", valor: 6000, fatura: "2026-10" })],
    [manual({ data: "2026-01-01" })]
  );
  const nub = a.txs("nubank");
  assert.equal(nub.length, 2);
  assert.ok(nub.every(t => !t.isFatura), "nenhuma fatura agregada aqui");
});

test("a fatura aparece na conta que a paga, não na do cartão", () => {
  const a = env([imp({ data: "2026-10-05", valor: 4000, fatura: "2026-10" })],
                [manual({ data: "2026-01-01" })]);
  assert.equal(a.txs("cc").filter(t => t.isFatura).length, 1);
  assert.equal(a.txs("nubank").filter(t => t.isFatura).length, 0);
});

test("faturas anteriores ao início do controle ficam fora do saldo", () => {
  /* A Pluggy devolve o histórico inteiro, inclusive faturas pagas antes de o
     app existir — elas já saíram da conta antes do saldo inicial, e somá-las
     jogava dezenas de milhares de reais de despesa fantasma. */
  const a = env(
    [imp({ data: "2020-05-05", valor: 999999, fatura: "2020-05" }),
     imp({ data: "2026-10-05", valor: 5000, fatura: "2026-10" })],
    [manual({ data: "2026-06-01" })]
  );
  const faturas = a.allTx().filter(t => t.isFatura);
  assert.equal(faturas.length, 1, "só a posterior ao primeiro lançamento manual");
  assert.equal(faturas[0].data, "2026-10-24");
});

test("sem lançamento manual nenhum, todas as faturas entram", () => {
  const a = env([imp({ data: "2020-05-05", valor: 5000, fatura: "2020-05" })], []);
  assert.equal(a.allTx().filter(t => t.isFatura).length, 1);
});

/* ---------- saldos ---------- */

test("opening soma o saldo inicial das contas pedidas", () => {
  const a = env([], [], [
    { id: "cc", nome: "CC", saldoInicial: 10000, cor: "#111111" },
    { id: "poup", nome: "Poupança", saldoInicial: 50000, cor: "#222222" }
  ]);
  assert.equal(a.opening("all"), 60000);
  assert.equal(a.opening("cc"), 10000);
});

test("realNow conta só o que está realizado", () => {
  const a = env([], [
    manual({ data: "2026-01-01", valor: 5000, tipo: "r", ok: true }),
    manual({ data: "2026-01-02", valor: 2000, tipo: "d", ok: true }),
    manual({ data: "2026-01-03", valor: 9999, tipo: "d", ok: false })
  ], [{ id: "cc", nome: "CC", saldoInicial: 1000, cor: "#111111" }]);
  assert.equal(a.realNow("cc"), 1000 + 5000 - 2000, "o previsto não entra");
});

test("balanceBefore corta na data e sabe separar previsto de realizado", () => {
  const a = env([], [
    manual({ data: "2026-01-01", valor: 1000, tipo: "d", ok: true }),
    manual({ data: "2026-01-05", valor: 2000, tipo: "d", ok: false }),
    manual({ data: "2026-02-01", valor: 4000, tipo: "d", ok: true })
  ], [{ id: "cc", nome: "CC", saldoInicial: 10000, cor: "#111111" }]);
  assert.equal(a.balanceBefore("2026-01-31", "cc", false), 10000 - 1000 - 2000, "previsto incluído");
  assert.equal(a.balanceBefore("2026-01-31", "cc", true), 10000 - 1000, "só realizado");
});

test("a compra do cartão não desconta do saldo duas vezes", () => {
  /* O ponto de toda a arquitetura: se a compra individual E a fatura
     contassem, a mesma despesa sairia duas vezes do saldo. */
  const a = env(
    [imp({ data: "2026-10-05", valor: 10000, fatura: "2026-10" })],
    [manual({ data: "2026-01-01", valor: 0, tipo: "d" })],
    [{ id: "cc", nome: "CC", saldoInicial: 100000, cor: "#111111" },
     { id: "nubank", nome: "Nubank", saldoInicial: 0, cor: "#820AD1" }]
  );
  /* Vencimento 24/10 já passou em relação a 2026-12-31, então está realizado. */
  assert.equal(a.balanceBefore("2026-12-31", "all", false), 100000 - 10000);
});

/* ---------- série mensal ---------- */

test("monthSeries devolve um ponto por dia do mês", () => {
  const a = env([], [manual({ data: "2026-02-10" })]);
  assert.equal(a.monthSeries(2026, 1, "all").n, 28, "fevereiro de 2026");
  assert.equal(a.monthSeries(2024, 1, "all").n, 29, "fevereiro bissexto");
  assert.equal(a.monthSeries(2026, 0, "all").days.length, 31);
});

test("monthSeries acumula previsto e realizado ao longo do mês", () => {
  const a = env([], [
    manual({ data: "2026-03-10", valor: 1000, tipo: "d", ok: true }),
    manual({ data: "2026-03-20", valor: 500, tipo: "d", ok: false })
  ], [{ id: "cc", nome: "CC", saldoInicial: 10000, cor: "#111111" }]);
  const s = a.monthSeries(2026, 2, "cc");
  const dia = n => s.days[n - 1];
  assert.equal(dia(9).proj, 10000, "antes de qualquer lançamento");
  assert.equal(dia(10).proj, 9000);
  assert.equal(dia(20).proj, 8500, "previsto desconta na projeção");
  assert.equal(dia(20).real, 9000, "mas não no realizado");
});

test("monthSeries registra entradas e saídas do dia", () => {
  const a = env([], [
    manual({ data: "2026-03-10", valor: 1000, tipo: "d" }),
    manual({ data: "2026-03-10", valor: 3000, tipo: "r" })
  ]);
  const d = a.monthSeries(2026, 2, "all").days[9];
  assert.equal(d.eout, 1000);
  assert.equal(d.ein, 3000);
  assert.equal(d.n, 2);
});

test("monthSeries considera a fatura agregada, não as compras", () => {
  const a = env(
    [imp({ data: "2026-10-05", valor: 3000, fatura: "2026-10" }),
     imp({ data: "2026-10-06", valor: 7000, fatura: "2026-10" })],
    [manual({ data: "2026-01-01", valor: 0 })]
  );
  const s = a.monthSeries(2026, 9, "all");
  const dia24 = s.days[23];
  assert.equal(dia24.eout, 10000, "um único lançamento de 100,00 no vencimento");
  assert.equal(dia24.n, 1, "e uma linha só, não duas");
});

/* ---------- consultas auxiliares ---------- */

test("catOf e accOf não quebram com id desconhecido", () => {
  const a = env();
  assert.equal(a.catOf("inexistente").nome, "Sem categoria");
  assert.equal(a.accOf("inexistente").nome, "—");
  assert.equal(a.catOf("mer").nome, "Mercado");
});

test("inicioControle acha o lançamento manual mais antigo", () => {
  const a = env([], [
    manual({ data: "2026-05-10" }),
    manual({ data: "2026-01-02" }),
    manual({ data: "2026-09-30" })
  ]);
  assert.equal(a.inicioControle(), "2026-01-02");
});

test("inicioControle é vazio quando não há lançamento manual", () => {
  assert.equal(env([], []).inicioControle(), "");
});

/* ---------- dados padrão ---------- */

test("blank começa limpo e com as categorias padrão", () => {
  const a = loadApp();
  const b = a.blank();
  assert.equal(b.tx.length, 0);
  assert.equal(b.sample, false);
  assert.equal(b.accounts.length, 1);
  assert.equal(b.categories.length, a.CATS.length);
});

test("seed produz dados de exemplo coerentes", () => {
  const a = loadApp();
  const s = a.seed();
  assert.equal(s.sample, true);
  assert.ok(s.tx.length > 0);
  const ids = new Set(s.accounts.map(x => x.id));
  const cats = new Set(s.categories.map(x => x.id));
  for (const t of s.tx) {
    assert.ok(ids.has(t.conta), `conta "${t.conta}" não existe`);
    assert.ok(cats.has(t.cat), `categoria "${t.cat}" não existe`);
    assert.ok(t.valor > 0, "valor é sempre positivo; o sinal vem do tipo");
    assert.ok(t.tipo === "r" || t.tipo === "d");
    assert.match(t.data, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("seed é determinístico no mesmo dia", () => {
  const x = loadApp().seed(), y = loadApp().seed();
  assert.equal(x.tx.length, y.tx.length);
  assert.deepEqual(x.tx.map(t => t.valor), y.tx.map(t => t.valor));
});

test("categorias padrão têm id único e cor hexadecimal", () => {
  const a = loadApp();
  const ids = a.CATS.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, "sem id repetido");
  for (const c of a.CATS) {
    assert.match(c.cor, /^#[0-9a-fA-F]{6}$/, `${c.id} tem cor inválida`);
    assert.ok(c.tipo === "r" || c.tipo === "d");
  }
});

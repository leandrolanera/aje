"use strict";
/*
 * Lógica de fatura de cartão. Boa parte destes casos é regressão: cada um
 * corresponde a um número errado que apareceu na tela com dado real do
 * Nubank/Pluggy. Os valores vêm desses episódios, não de exemplos inventados.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app.js");

/* Um ambiente por teste: pluggyTx e S são estado de módulo. */
function env(pluggyTx = [], tx = [], contas) {
  const a = loadApp();
  a.seedEstado(tx, contas);
  a.set("pluggyTx", pluggyTx);
  return a;
}

/* Transação importada já no formato que mapPluggyRow produz. */
function imp(o) {
  return Object.assign({
    id: "pg-" + Math.random().toString(36).slice(2),
    data: "2026-10-10", desc: "Compra", valor: 1000, tipo: "d", cat: "out",
    conta: "nubank", ok: true, imported: true, fatura: null, pagamento: false
  }, o);
}

/* ---------- ciclo de faturamento ---------- */

test("faturaDe: compra até o fechamento entra na fatura do mês", () => {
  const a = loadApp();
  assert.equal(a.faturaDe("2026-10-01"), "2026-10-24");
  assert.equal(a.faturaDe("2026-10-17"), "2026-10-24", "o próprio dia do fechamento ainda entra");
});

test("faturaDe: compra depois do fechamento vai para o mês seguinte", () => {
  const a = loadApp();
  assert.equal(a.faturaDe("2026-10-18"), "2026-11-24", "um dia após o fechamento já vira");
  assert.equal(a.faturaDe("2026-10-31"), "2026-11-24");
});

test("faturaDe atravessa a virada de ano", () => {
  const a = loadApp();
  assert.equal(a.faturaDe("2026-12-31"), "2027-01-24");
  assert.equal(a.faturaDe("2026-12-17"), "2026-12-24");
});

test("faturaDe funciona em fevereiro (dia 24 existe em todo mês)", () => {
  const a = loadApp();
  assert.equal(a.faturaDe("2026-01-20"), "2026-02-24");
  assert.equal(a.faturaDe("2026-02-10"), "2026-02-24");
});

test("vencDe prefere o mês de fatura que a Pluggy informa", () => {
  const a = loadApp();
  /* O fechamento do Nubank varia de mês a mês, e parcela de compra antiga vem
     datada do fechamento — por isso billForecastDate manda sobre a data. */
  assert.equal(a.vencDe(imp({ data: "2026-09-17", fatura: "2027-05" })), "2027-05-24");
});

test("vencDe cai no cálculo por data quando a Pluggy não informa a fatura", () => {
  const a = loadApp();
  assert.equal(a.vencDe(imp({ data: "2026-10-20", fatura: null })), "2026-11-24");
});

/* ---------- conta pagadora ---------- */

test("contaFatura usa a conta corrente padrão quando ela existe", () => {
  const a = env();
  assert.equal(a.contaFatura(), "cc");
});

test("contaFatura não aponta para conta inexistente nem para o próprio cartão", () => {
  /* Sem esta regra a fatura ia para uma conta fantasma e sumia da previsão. */
  const a = env([], [], [
    { id: "x1", nome: "Banco X", saldoInicial: 0, cor: "#111111" },
    { id: "nubank", nome: "Nubank", saldoInicial: 0, cor: "#820AD1" }
  ]);
  assert.equal(a.contaFatura(), "x1");
});

test("contaFatura sobrevive a lista só com o cartão", () => {
  const a = env([], [], [{ id: "nubank", nome: "Nubank", saldoInicial: 0, cor: "#820AD1" }]);
  assert.equal(a.contaFatura(), "nubank", "sem alternativa, usa a única conta em vez de quebrar");
});

/* ---------- soma da fatura ---------- */

test("fatura soma as compras do ciclo num lançamento só", () => {
  const a = env([
    imp({ data: "2026-10-05", valor: 4590, fatura: "2026-10" }),
    imp({ data: "2026-10-06", valor: 5410, fatura: "2026-10" })
  ]);
  const f = a.pluggyBillEntries();
  assert.equal(f.length, 1);
  assert.equal(f[0].data, "2026-10-24");
  assert.equal(f[0].valor, 10000);
  assert.equal(f[0].tipo, "d");
  assert.equal(f[0].count, 2);
  assert.equal(f[0].conta, "cc", "a fatura é paga pela conta corrente");
  assert.equal(f[0].cat, "car");
  assert.equal(f[0].isFatura, true);
});

test("estorno abate a fatura em vez de somar", () => {
  const a = env([
    imp({ data: "2026-10-05", valor: 10000, tipo: "d", fatura: "2026-10" }),
    imp({ data: "2026-10-06", valor: 3000, tipo: "r", fatura: "2026-10", desc: "Estorno" })
  ]);
  assert.equal(a.pluggyBillEntries()[0].valor, 7000);
});

test("pagamento da fatura fica fora da soma", () => {
  /* Regressão: pagamento é o outro lado do próprio lançamento na conta
     corrente. Somá-lo contava o dinheiro duas vezes — e como é pago no
     vencimento (depois do fechamento), caía no ciclo seguinte e zerava a
     fatura do mês seguinte inteira. */
  const a = env([
    imp({ data: "2026-10-05", valor: 10000, fatura: "2026-10" }),
    imp({ data: "2026-10-24", valor: 9000, tipo: "r", fatura: "2026-10",
          desc: "Pagamento recebido", pagamento: true })
  ]);
  assert.equal(a.pluggyBillEntries()[0].valor, 10000, "o pagamento não pode abater");
});

test("fatura nunca vira receita quando o crédito supera os débitos", () => {
  /* Regressão do parcelamento: o "Crédito de parcelamento" (R$ 5.239,42) caiu
     inteiro no ciclo de outubro, mas quita dívida de outros ciclos. Sobrava
     crédito e a fatura virava tipo "r" — R$ 1.259,37 de receita fantasma na
     previsão de saldo. */
  const a = env([
    imp({ data: "2026-10-10", valor: 398005, tipo: "d", fatura: "2026-10" }),
    imp({ data: "2026-10-13", valor: 266454, tipo: "r", fatura: "2026-10", desc: "Crédito de parcelamento" }),
    imp({ data: "2026-10-13", valor: 257488, tipo: "r", fatura: "2026-10", desc: "Crédito de parcelamento" })
  ]);
  assert.deepEqual(a.pluggyBillEntries(), [], "crédito maior que o débito é nada a pagar, não dinheiro entrando");
});

test("fatura exatamente zerada não gera lançamento", () => {
  const a = env([
    imp({ data: "2026-10-05", valor: 10000, tipo: "d", fatura: "2026-10" }),
    imp({ data: "2026-10-06", valor: 10000, tipo: "r", fatura: "2026-10" })
  ]);
  assert.deepEqual(a.pluggyBillEntries(), []);
});

test("cada ciclo vira uma fatura própria, inclusive as futuras", () => {
  /* As parcelas já contratadas vêm da Pluggy com a data do mês em que serão
     cobradas — é daí que saem as faturas futuras, sem projeção nossa. */
  const a = env([
    imp({ data: "2026-10-05", valor: 5000, fatura: "2026-10" }),
    imp({ data: "2026-11-05", valor: 41930, fatura: "2026-11" }),
    imp({ data: "2027-05-27", valor: 41930, fatura: "2027-06" })
  ]);
  const f = a.pluggyBillEntries().sort((x, y) => x.data < y.data ? -1 : 1);
  assert.deepEqual(f.map(x => x.data), ["2026-10-24", "2026-11-24", "2027-06-24"]);
  assert.deepEqual(f.map(x => x.valor), [5000, 41930, 41930]);
});

test("fatura com vencimento passado conta como realizada", () => {
  const a = env([imp({ data: "2020-01-05", valor: 5000, fatura: "2020-01" })]);
  assert.equal(a.pluggyBillEntries()[0].ok, true);
});

test("fatura com vencimento futuro conta como prevista", () => {
  const a = env([imp({ data: "2099-01-05", valor: 5000, fatura: "2099-01" })]);
  assert.equal(a.pluggyBillEntries()[0].ok, false);
});

test("sem transações importadas não há fatura", () => {
  assert.deepEqual(env([]).pluggyBillEntries(), []);
});

/* ---------- duplicata PENDING/POSTED ---------- */

test("descarta a pendente quando a mesma transação já foi confirmada", () => {
  /* A Pluggy às vezes emite transaction_id novo ao confirmar, em vez de
     atualizar a pendente — o upsert guardava as duas e a compra dobrava. */
  const a = loadApp();
  const r = a.dedupPendentes([
    imp({ data: "2026-09-25", desc: "Pagamento recebido", valor: 189666, ok: true }),
    imp({ data: "2026-09-25", desc: "Pagamento recebido", valor: 189666, ok: false })
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].ok, true, "fica a confirmada");
});

test("compra repetida de verdade não é descartada", () => {
  /* Seis "Metro Rj" de R$ 7,90 no mesmo dia são seis viagens. O que separa
     dos duplicados é o status: repetição real vem toda com o mesmo. */
  const a = loadApp();
  const seis = [...Array(6)].map(() => imp({ data: "2026-02-15", desc: "Metro Rj", valor: 790, ok: true }));
  assert.equal(a.dedupPendentes(seis).length, 6);
});

test("duas pendentes iguais sem confirmada permanecem", () => {
  const a = loadApp();
  const duas = [...Array(2)].map(() => imp({ data: "2026-09-19", desc: "Uber", valor: 1292, ok: false }));
  assert.equal(a.dedupPendentes(duas).length, 2);
});

test("o descarte é contado: sai no máximo uma pendente por confirmada", () => {
  const a = loadApp();
  const base = { data: "2026-10-01", desc: "X", valor: 1000 };
  const r = a.dedupPendentes([
    imp(Object.assign({ ok: true }, base)),
    imp(Object.assign({ ok: false }, base)),
    imp(Object.assign({ ok: false }, base)),
    imp(Object.assign({ ok: false }, base))
  ]);
  assert.equal(r.length, 3, "1 confirmada + 2 pendentes sobrando");
  assert.equal(r.filter(x => !x.ok).length, 2);
});

test("dedup não mistura transações de valor ou data diferentes", () => {
  const a = loadApp();
  const r = a.dedupPendentes([
    imp({ data: "2026-10-03", desc: "Z", valor: 100, ok: true }),
    imp({ data: "2026-10-03", desc: "Z", valor: 200, ok: false }),
    imp({ data: "2026-10-04", desc: "Z", valor: 100, ok: false })
  ]);
  assert.equal(r.length, 3);
});

test("dedup evita a contagem dobrada na fatura", () => {
  const compra = { data: "2026-10-05", desc: "Mercado", valor: 10000, fatura: "2026-10" };
  const brutas = [imp(Object.assign({ ok: true }, compra)), imp(Object.assign({ ok: false }, compra))];

  const semDedup = env(brutas);
  assert.equal(semDedup.pluggyBillEntries()[0].valor, 20000, "sem dedup, o bug aparece");

  const comDedup = env(loadApp().dedupPendentes(brutas));
  assert.equal(comDedup.pluggyBillEntries()[0].valor, 10000);
});

/* ---------- mapeamento vindo do banco ---------- */

test("mapPluggyRow traduz a linha do Supabase para o formato do app", () => {
  const a = loadApp();
  const r = a.mapPluggyRow({
    transaction_id: "abc", date: "2026-10-05", description: "iFood",
    amount_cents: 4590, tipo: "d", status: "POSTED",
    category_pluggy: "Restaurante", fatura: "2026-10"
  });
  assert.equal(r.id, "pg-abc", "prefixo evita colisão com id de lançamento manual");
  assert.equal(r.valor, 4590);
  assert.equal(r.conta, "nubank");
  assert.equal(r.ok, true);
  assert.equal(r.imported, true);
  assert.equal(r.cat, "res");
  assert.equal(r.fatura, "2026-10");
  assert.equal(r.pagamento, false);
});

test("mapPluggyRow marca PENDING como não realizado", () => {
  const a = loadApp();
  assert.equal(a.mapPluggyRow({ transaction_id: "x", status: "PENDING", amount_cents: 1, tipo: "d" }).ok, false);
});

test("mapPluggyRow identifica o pagamento da fatura", () => {
  const a = loadApp();
  const porCategoria = a.mapPluggyRow({ transaction_id: "x", tipo: "r", amount_cents: 1,
    category_pluggy: "Credit card payment", description: "qualquer" });
  const porDescricao = a.mapPluggyRow({ transaction_id: "y", tipo: "r", amount_cents: 1,
    category_pluggy: "Transfers", description: "Pagamento recebido" });
  assert.equal(porCategoria.pagamento, true);
  assert.equal(porDescricao.pagamento, true);
});

test("'Parcelamento de Fatura' não é pagamento: é débito que soma", () => {
  /* Vem com a mesma categoria do pagamento, mas é a parcela entrando na
     fatura — se fosse excluída, a dívida sumiria. */
  const a = loadApp();
  const r = a.mapPluggyRow({ transaction_id: "x", tipo: "d", amount_cents: 81643,
    category_pluggy: "Credit card payment", description: "Parcelamento de Fatura" });
  assert.equal(r.pagamento, false);
});

test("'Crédito de parcelamento' não é pagamento: abate a fatura", () => {
  const a = loadApp();
  const r = a.mapPluggyRow({ transaction_id: "x", tipo: "r", amount_cents: 266454,
    category_pluggy: "Transfers", description: "Crédito de parcelamento" });
  assert.equal(r.pagamento, false);
});

test("mapCategory usa o mapa e cai em cartão de crédito quando não conhece", () => {
  const a = loadApp();
  assert.equal(a.mapCategory("Supermercado"), "mer");
  assert.equal(a.mapCategory("Restaurante"), "res");
  assert.equal(a.mapCategory("Categoria Que Não Existe"), "car");
  assert.equal(a.mapCategory(null), "car");
});

test("todo destino do mapa de categorias existe na lista do app", () => {
  const a = loadApp();
  const ids = new Set(a.CATS.map(c => c.id));
  for (const [origem, destino] of Object.entries(a.PLUGGY_CAT_MAP)) {
    assert.ok(ids.has(destino), `"${origem}" aponta para "${destino}", que não existe em CATS`);
  }
  assert.ok(ids.has("car"), "o fallback precisa existir");
});

/* ---------- marcação visual ---------- */

test("linha de fatura mostra a contagem de compras com plural correto", () => {
  const a = env();
  assert.match(a.rowHTML({ data: "2026-10-24", desc: "Fatura Nubank", valor: 100, tipo: "d",
    cat: "car", conta: "cc", ok: false, imported: true, isFatura: true, count: 1 }), /1 compra</);
  assert.match(a.rowHTML({ data: "2026-10-24", desc: "Fatura Nubank", valor: 100, tipo: "d",
    cat: "car", conta: "cc", ok: false, imported: true, isFatura: true, count: 3 }), /3 compras</);
});

test("linha importada é só leitura: sem editar e sem marcar realizado", () => {
  const a = env();
  const html = a.rowHTML(imp({ desc: "iFood" }));
  assert.ok(!html.includes('data-act="edit"'), "não abre o formulário de edição");
  assert.ok(!html.includes('data-act="toggle"'), "não deixa alternar previsto/realizado");
  assert.match(html, /Nubank</, "mas leva o selo de origem");
});

test("linha manual continua editável", () => {
  const a = env();
  const html = a.rowHTML({ id: "m1", data: "2026-10-05", desc: "Aluguel", valor: 100,
    tipo: "d", cat: "mor", conta: "cc", ok: true });
  assert.ok(html.includes('data-act="edit"'));
  assert.ok(html.includes('data-act="toggle"'));
});

test("rowHTML escapa descrição para não injetar HTML", () => {
  const a = env();
  const html = a.rowHTML({ id: "m1", data: "2026-10-05", desc: '<img onerror=x>', valor: 100,
    tipo: "d", cat: "mor", conta: "cc", ok: true });
  assert.ok(!html.includes("<img"), "a tag precisa sair escapada");
  assert.ok(html.includes("&lt;img"));
});

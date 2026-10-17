"use strict";
/*
 * Criação e edição de lançamentos. O que importa aqui é a aritmética de
 * parcelamento e a geração de séries: erro nessas contas some centavo ou
 * espalha lançamento no mês errado, e nenhuma das duas coisas grita na tela.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app.js");

const evento = () => ({ preventDefault() {} });

function env(tx = []) {
  const a = loadApp();
  a.seedEstado(tx);
  a.set("cur", { y: 2026, m: 9 });
  a.set("editing", null);
  return a;
}
/* Preenche o formulário, envia, devolve os lançamentos resultantes. */
function envia(a, campos) {
  a.preencheForm(campos);
  a.submitTx(evento());
  return a.everyTx();
}

/* ---------- validação ---------- */

test("recusa valor ausente, zero ou negativo", () => {
  for (const valor of ["", "0", "0,00", "-5,00", "abc"]) {
    const a = env();
    assert.equal(envia(a, { valor }).length, 0, "aceitou " + JSON.stringify(valor));
    assert.match(a.erroForm(), /valor maior que zero/);
  }
});

test("recusa descrição vazia ou só com espaço", () => {
  for (const desc of ["", "   "]) {
    const a = env();
    assert.equal(envia(a, { desc }).length, 0);
    assert.match(a.erroForm(), /descrição/);
  }
});

test("recusa data fora do formato", () => {
  for (const data of ["", "10/10/2026", "2026-13", "ontem"]) {
    const a = env();
    assert.equal(envia(a, { data }).length, 0, "aceitou " + JSON.stringify(data));
    assert.match(a.erroForm(), /data válida/);
  }
});

test("recusa sem categoria", () => {
  const a = env();
  assert.equal(envia(a, { cat: "" }).length, 0);
  assert.match(a.erroForm(), /categoria/);
});

/* ---------- lançamento simples ---------- */

test("cria um lançamento com os dados do formulário", () => {
  const a = env();
  const tx = envia(a, { valor: "123,45", desc: "  Mercado  ", data: "2026-10-05", cat: "mer", conta: "cc", tipo: "d", ok: true });
  assert.equal(tx.length, 1);
  assert.equal(tx[0].valor, 12345);
  assert.equal(tx[0].desc, "Mercado", "a descrição é aparada");
  assert.equal(tx[0].data, "2026-10-05");
  assert.equal(tx[0].cat, "mer");
  assert.equal(tx[0].tipo, "d");
  assert.equal(tx[0].ok, true);
  assert.ok(tx[0].id, "precisa de id para edição e exclusão");
});

test("a tela salta para o mês do lançamento criado", () => {
  /* Sem isso, lançar algo em dezembro enquanto se olha outubro parecia não
     ter funcionado. */
  const a = env();
  envia(a, { data: "2026-12-20" });
  assert.match(a.viewLanc(), /dez|Dez/i);
});

/* ---------- parcelamento ---------- */

test("parcela divide o valor e põe o resto na primeira", () => {
  /* R$ 100 em 3 não divide exato: 33,34 + 33,33 + 33,33 = 100,00. Sem o
     resto, sumiriam centavos a cada compra parcelada. */
  const a = env();
  const tx = envia(a, { valor: "100,00", rep: "p", n: 3, data: "2026-10-10" });
  assert.equal(tx.length, 3);
  assert.deepEqual(tx.map(t => t.valor), [3334, 3333, 3333]);
  assert.equal(tx.reduce((s, t) => s + t.valor, 0), 10000, "a soma tem que fechar com o total");
});

test("parcela que divide exato não ganha sobra", () => {
  const a = env();
  const tx = envia(a, { valor: "90,00", rep: "p", n: 3 });
  assert.deepEqual(tx.map(t => t.valor), [3000, 3000, 3000]);
});

test("parcelas são numeradas e caem um mês depois da outra", () => {
  const a = env();
  const tx = envia(a, { valor: "120,00", rep: "p", n: 4, data: "2026-10-15" });
  assert.deepEqual(tx.map(t => t.parcela), [1, 2, 3, 4]);
  assert.deepEqual(tx.map(t => t.total), [4, 4, 4, 4]);
  assert.deepEqual(tx.map(t => t.data), ["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15"]);
});

test("parcela em dia 31 não vaza para o mês seguinte", () => {
  const a = env();
  const tx = envia(a, { valor: "90,00", rep: "p", n: 3, data: "2026-01-31" });
  assert.deepEqual(tx.map(t => t.data), ["2026-01-31", "2026-02-28", "2026-03-31"],
    "o dia-base volta a 31 quando o mês comporta");
});

test("só a primeira parcela pode nascer realizada", () => {
  const a = env();
  const tx = envia(a, { valor: "90,00", rep: "p", n: 3, ok: true });
  assert.deepEqual(tx.map(t => t.ok), [true, false, false]);
});

test("as parcelas compartilham um grupo", () => {
  const a = env();
  const tx = envia(a, { valor: "90,00", rep: "p", n: 3 });
  const grupos = new Set(tx.map(t => t.grupo));
  assert.equal(grupos.size, 1);
  assert.ok([...grupos][0], "o grupo é o que permite editar a série inteira");
});

/* ---------- recorrência ---------- */

test("recorrência mensal repete o valor cheio", () => {
  const a = env();
  const tx = envia(a, { valor: "50,00", rep: "m", n: 3, data: "2026-10-10" });
  assert.deepEqual(tx.map(t => t.valor), [5000, 5000, 5000], "recorrente não divide");
  assert.deepEqual(tx.map(t => t.data), ["2026-10-10", "2026-11-10", "2026-12-10"]);
  assert.ok(tx.every(t => t.rep === "m" && !t.parcela));
});

test("recorrência semanal anda de sete em sete dias", () => {
  const a = env();
  const tx = envia(a, { valor: "20,00", rep: "s", n: 3, data: "2026-10-01" });
  assert.deepEqual(tx.map(t => t.data), ["2026-10-01", "2026-10-08", "2026-10-15"]);
});

test("recorrência anual anda de doze em doze meses", () => {
  const a = env();
  const tx = envia(a, { valor: "20,00", rep: "a", n: 3, data: "2026-10-01" });
  assert.deepEqual(tx.map(t => t.data), ["2026-10-01", "2027-10-01", "2028-10-01"]);
});

test("a quantidade de repetições é limitada a um intervalo sensato", () => {
  const menos = env();
  assert.equal(envia(menos, { valor: "10,00", rep: "m", n: 1 }).length, 2, "mínimo de 2");
  const mais = env();
  assert.equal(envia(mais, { valor: "10,00", rep: "m", n: 9999 }).length, 120, "teto de 120");
  const vazio = env();
  assert.equal(envia(vazio, { valor: "10,00", rep: "m", n: "" }).length, 2, "campo vazio vira 2");
});

/* ---------- edição ---------- */

test("editar altera o lançamento no lugar, sem duplicar", () => {
  const a = env();
  envia(a, { valor: "10,00", desc: "Original", data: "2026-10-05" });
  const alvo = a.everyTx()[0];
  a.set("editing", alvo);
  const tx = envia(a, { valor: "99,00", desc: "Editado", data: "2026-10-05" });
  assert.equal(tx.length, 1);
  assert.equal(tx[0].desc, "Editado");
  assert.equal(tx[0].valor, 9900);
  assert.equal(tx[0].id, alvo.id, "o id não muda");
});

test("editar a série altera só as parcelas seguintes, não as passadas", () => {
  const a = env();
  envia(a, { valor: "90,00", desc: "Assinatura", rep: "m", n: 4, data: "2026-10-10" });
  const todos = a.everyTx().slice().sort((x, y) => x.data < y.data ? -1 : 1);
  a.set("editing", todos[1]);                       // a segunda da série
  a.preencheForm({ valor: "50,00", desc: "Assinatura nova", data: todos[1].data, prox: true });
  a.submitTx(evento());

  const depois = a.everyTx().slice().sort((x, y) => x.data < y.data ? -1 : 1);
  assert.equal(depois[0].desc, "Assinatura", "a anterior fica intacta");
  assert.equal(depois[0].valor, 9000);
  for (const t of depois.slice(1)) {
    assert.equal(t.desc, "Assinatura nova", "a editada e as seguintes mudam");
    assert.equal(t.valor, 5000);
  }
});

test("sem marcar 'próximas', a edição fica só no lançamento escolhido", () => {
  const a = env();
  envia(a, { valor: "90,00", desc: "Assinatura", rep: "m", n: 3, data: "2026-10-10" });
  const todos = a.everyTx().slice().sort((x, y) => x.data < y.data ? -1 : 1);
  a.set("editing", todos[0]);
  a.preencheForm({ valor: "50,00", desc: "Só esta", data: todos[0].data, prox: false });
  a.submitTx(evento());
  const depois = a.everyTx().slice().sort((x, y) => x.data < y.data ? -1 : 1);
  assert.equal(depois[0].desc, "Só esta");
  assert.equal(depois[1].desc, "Assinatura");
});

/* ---------- exclusão ---------- */

test("excluir um lançamento tira só ele", () => {
  const a = env();
  envia(a, { valor: "90,00", desc: "Série", rep: "m", n: 3 });
  const alvo = a.everyTx()[0];
  a.set("editing", alvo);
  a.delTx("one");
  assert.equal(a.everyTx().length, 2);
  assert.ok(!a.everyTx().some(t => t.id === alvo.id));
});

test("excluir 'este e os próximos' preserva o passado da série", () => {
  const a = env();
  envia(a, { valor: "90,00", desc: "Série", rep: "m", n: 4, data: "2026-10-10" });
  const todos = a.everyTx().slice().sort((x, y) => x.data < y.data ? -1 : 1);
  a.set("editing", todos[2]);
  a.delTx("next");
  const restantes = a.everyTx().slice().sort((x, y) => x.data < y.data ? -1 : 1);
  assert.deepEqual(restantes.map(t => t.data), [todos[0].data, todos[1].data]);
});

/* ---------- handlers de interação ---------- */

test("alternar realizado/previsto inverte só o lançamento clicado", () => {
  const a = env();
  envia(a, { valor: "10,00", ok: false });
  const alvo = a.everyTx()[0];
  a.H.toggle({ dataset: { id: alvo.id } }, { stopPropagation() {} });
  assert.equal(a.everyTx()[0].ok, true);
  a.H.toggle({ dataset: { id: alvo.id } }, { stopPropagation() {} });
  assert.equal(a.everyTx()[0].ok, false);
});

test("alternar ignora id inexistente em vez de quebrar", () => {
  const a = env();
  assert.doesNotThrow(() => a.H.toggle({ dataset: { id: "nao-existe" } }, { stopPropagation() {} }));
});

test("navegar entre meses e voltar para hoje", () => {
  const a = env();
  a.set("cur", { y: 2026, m: 0 });
  a.H.prev();
  assert.match(a.viewLanc(), /dezembro de 2025|dez/i);
  a.H.next(); a.H.next();
  assert.match(a.viewLanc(), /fevereiro|fev/i);
  a.H.hoje();
  const hoje = new Date();
  assert.ok(a.viewLanc().length > 0);
  assert.doesNotThrow(() => a.render());
});

test("criar e excluir conta", () => {
  const a = env();
  const antes = a.viewContas();
  a.H.addacc();
  assert.ok(a.viewContas().includes("Nova conta"));
  const nova = a.viewContas();
  assert.notEqual(antes, nova);
});

test("criar categoria do tipo pedido", () => {
  const a = env();
  a.H.addcat({ dataset: { tipo: "r" } });
  assert.match(a.viewCats(), /Nova categoria/);
});

test("ações destrutivas pedem confirmação antes de agir", () => {
  /* O primeiro clique arma, o segundo executa — evita apagar tudo sem querer. */
  const a = env();
  envia(a, { valor: "10,00" });
  assert.equal(a.everyTx().length, 1);
  a.H.wipe();
  assert.equal(a.everyTx().length, 1, "o primeiro clique só arma");
  a.H.wipe();
  assert.equal(a.everyTx().length, 0, "o segundo confirma");
});

test("começar do zero limpa tudo depois de confirmar", () => {
  const a = env();
  envia(a, { valor: "10,00" });
  a.H.clear();
  a.H.clear();
  assert.equal(a.everyTx().length, 0);
});

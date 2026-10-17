"use strict";
/*
 * Telas e filtros. O alvo não é o visual — é o que cada tela faz com os
 * números: se a fatura agregada aparece no lugar das compras, se o filtro
 * encontra o que deve, se nada quebra com dado vazio ou hostil.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app.js");

function env(pluggyTx = [], tx = [], contas) {
  const a = loadApp();
  a.seedEstado(tx, contas);
  a.set("pluggyTx", pluggyTx);
  a.set("cur", { y: 2026, m: 9 }); // outubro/2026
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

/* ---------- cada tela renderiza ---------- */

test("todas as telas produzem HTML sem quebrar", () => {
  const a = env([imp({ fatura: "2026-10" })], [manual()]);
  for (const nome of Object.keys(a.VIEWS)) {
    const html = a.VIEWS[nome]();
    assert.equal(typeof html, "string", nome);
    assert.ok(html.length > 0, nome + " veio vazio");
  }
});

test("todas as telas aguentam estado completamente vazio", () => {
  const a = env([], []);
  for (const nome of Object.keys(a.VIEWS)) {
    assert.doesNotThrow(() => a.VIEWS[nome](), nome);
  }
});

test("render monta a tela atual sem erro, inclusive a do gráfico", () => {
  const a = env([imp({ fatura: "2026-10" })], [manual()]);
  for (const v of ["geral", "lanc", "fluxo", "contas", "cats"]) {
    a.set("view", v);
    assert.doesNotThrow(() => a.render(), v);
  }
});

test("render não faz nada antes de existir estado", () => {
  const a = loadApp();
  a.set("S", null);
  assert.doesNotThrow(() => a.render());
});

test("render descarta filtro apontando para conta que não existe mais", () => {
  const a = env([], [manual()]);
  a.set("filtro", { conta: "fantasma", status: "all", tipo: "all", cat: "all", q: "" });
  a.set("view", "lanc");
  a.render();
  /* Sem isso a tela ficaria permanentemente vazia depois de excluir a conta. */
  assert.equal(a.txs("all").length, a.allTx().length);
});

/* ---------- visão geral ---------- */

test("visão geral mostra o saldo e a quebra por categoria", () => {
  const a = env([], [
    manual({ data: "2026-10-05", valor: 50000, tipo: "r", cat: "sal" }),
    manual({ data: "2026-10-06", valor: 12000, tipo: "d", cat: "mer" })
  ]);
  const html = a.viewGeral();
  assert.match(html, /Saldo hoje/);
  assert.match(html, /Mercado/, "a categoria usada precisa aparecer na quebra");
  assert.match(html, /Receitas do mês/);
});

test("visão geral exibe a fatura agregada, não cada compra", () => {
  const a = env([
    imp({ data: "2026-10-05", valor: 4000, fatura: "2026-10", desc: "iFood" }),
    imp({ data: "2026-10-06", valor: 6000, fatura: "2026-10", desc: "Mercado" })
  ], [manual({ data: "2026-01-01", valor: 1 })]);
  a.set("filtro", { conta: "all", status: "all", tipo: "all", cat: "all", q: "" });
  const html = a.viewGeral();
  assert.ok(!html.includes("iFood"), "compra individual não aparece na visão geral");
});

test("filtrando pela conta do cartão, a visão geral mostra as compras", () => {
  const a = env([
    imp({ data: "2026-10-05", valor: 4000, fatura: "2026-10", desc: "iFood", cat: "res" })
  ], [manual({ data: "2026-01-01", valor: 1 })]);
  a.set("filtro", { conta: "nubank", status: "all", tipo: "all", cat: "all", q: "" });
  const html = a.viewGeral();
  assert.match(html, /Restaurantes/, "a quebra por categoria usa a categoria real da compra");
});

/* ---------- lançamentos e filtros ---------- */

test("filteredList respeita o filtro de status", () => {
  const a = env([], [
    manual({ data: "2026-10-05", ok: true, desc: "Pago" }),
    manual({ data: "2026-10-06", ok: false, desc: "Previsto" })
  ]);
  const comFiltro = f => { a.set("filtro", Object.assign({ conta: "all", status: "all", tipo: "all", cat: "all", q: "" }, f)); return a.filteredList(); };
  assert.equal(comFiltro({}).length, 2);
  assert.deepEqual(comFiltro({ status: "ok" }).map(t => t.desc), ["Pago"]);
  assert.deepEqual(comFiltro({ status: "plan" }).map(t => t.desc), ["Previsto"]);
});

test("filteredList respeita tipo e categoria", () => {
  const a = env([], [
    manual({ data: "2026-10-05", tipo: "r", cat: "sal", desc: "Salário" }),
    manual({ data: "2026-10-06", tipo: "d", cat: "mer", desc: "Feira" })
  ]);
  const comFiltro = f => { a.set("filtro", Object.assign({ conta: "all", status: "all", tipo: "all", cat: "all", q: "" }, f)); return a.filteredList(); };
  assert.deepEqual(comFiltro({ tipo: "r" }).map(t => t.desc), ["Salário"]);
  assert.deepEqual(comFiltro({ cat: "mer" }).map(t => t.desc), ["Feira"]);
});

test("a busca encontra por descrição e por nome de categoria", () => {
  const a = env([], [
    manual({ data: "2026-10-05", desc: "Padaria", cat: "mer" }),
    manual({ data: "2026-10-06", desc: "Uber", cat: "tra" })
  ]);
  const busca = q => { a.set("filtro", { conta: "all", status: "all", tipo: "all", cat: "all", q }); return a.filteredList().map(t => t.desc); };
  assert.deepEqual(busca("pada"), ["Padaria"], "parcial e sem diferenciar maiúscula");
  assert.deepEqual(busca("PADARIA"), ["Padaria"]);
  assert.deepEqual(busca("transporte"), ["Uber"], "acha pelo nome da categoria");
  assert.deepEqual(busca("   "), ["Padaria", "Uber"], "só espaço não filtra nada");
  assert.deepEqual(busca("zzz"), []);
});

test("a lista de lançamentos avisa quando não há nada no mês", () => {
  const a = env([], []);
  assert.match(a.viewLanc(), /Nenhum lançamento/);
});

test("a lista agrupa por dia e marca o dia de hoje", () => {
  const a = env([], [manual({ data: a0(), desc: "Hoje" })]);
  a.set("cur", hojeCur());
  assert.match(a.viewLanc(), /Hoje</);
});
function a0() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function hojeCur() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; }

/* ---------- fluxo diário ---------- */

test("fluxo diário monta a tabela com uma linha por dia", () => {
  const a = env([], [manual({ data: "2026-10-05", valor: 1000 })]);
  const html = a.viewFluxo();
  assert.match(html, /Saldo inicial do mês/);
  assert.match(html, /Total do mês/);
});

/* ---------- contas ---------- */

test("conta com lançamento não pode ser excluída", () => {
  const a = env([], [manual({ conta: "cc" })]);
  const html = a.viewContas();
  assert.match(html, /Conta com lançamentos não pode ser excluída/);
});

test("a última conta nunca pode ser excluída", () => {
  const a = env([], [], [{ id: "cc", nome: "Única", saldoInicial: 0, cor: "#111111" }]);
  assert.match(a.viewContas(), /ao menos uma conta/);
});

test("a conta do cartão mostra quando sincronizou, as outras não", () => {
  const a = env([imp({ fatura: "2026-10" })], [manual({ data: "2026-01-01" })]);
  assert.ok(!a.viewContas().includes("Sincronizado com o banco"), "sem timestamp não mostra nada");
});

/* ---------- categorias ---------- */

test("categoria em uso não pode ser excluída, inclusive por compra do cartão", () => {
  /* A compra individual não aparece na visão geral, mas a categoria dela
     continua em uso — excluir deixaria lançamento órfão. */
  const a = env([imp({ cat: "res", fatura: "2026-10" })], [manual({ data: "2026-01-01", cat: "mor" })]);
  const html = a.viewCats();
  assert.match(html, /Categoria em uso/);
});

test("a tela de categorias separa receitas de despesas", () => {
  const a = env([], []);
  const html = a.viewCats();
  assert.match(html, /Despesas/);
  assert.match(html, /Receitas/);
});

/* ---------- painel de sincronização ---------- */

test("sem Supabase configurado, o painel de sincronização some", () => {
  const a = env();
  assert.equal(a.syncPanel(), "", "quem não configurou não vê opção de conta");
});

test("com Supabase e sem sessão, o painel oferece e-mail e Google", () => {
  const a = loadApp({ supabase: fakeSupabase() });
  a.seedEstado([], undefined);
  const html = a.syncPanel();
  assert.match(html, /Enviar link de acesso/);
  assert.match(html, /Entrar com Google/);
});

test("logado só por e-mail, o painel oferece conectar o Google", () => {
  const a = loadApp({ supabase: fakeSupabase() });
  a.seedEstado([], undefined);
  a.set("authUser", { email: "eu@exemplo.com", identities: [{ provider: "email" }] });
  const html = a.syncPanel();
  assert.match(html, /Conectar Google/);
  assert.match(html, /eu@exemplo\.com/);
});

test("com o Google já vinculado, o botão de conectar some", () => {
  const a = loadApp({ supabase: fakeSupabase() });
  a.seedEstado([], undefined);
  a.set("authUser", { email: "eu@exemplo.com", identities: [{ provider: "email" }, { provider: "google" }] });
  assert.ok(!a.syncPanel().includes("Conectar Google"));
});

test("o e-mail da conta é escapado no painel", () => {
  const a = loadApp({ supabase: fakeSupabase() });
  a.seedEstado([], undefined);
  a.set("authUser", { email: '<img onerror=x>', identities: [] });
  const html = a.syncPanel();
  assert.ok(!html.includes("<img"));
});

function fakeSupabase() {
  return {
    auth: { onAuthStateChange() {}, signOut() {}, signInWithOtp: async () => ({}) },
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {}
  };
}

/* ---------- auxiliares de marcação ---------- */

test("catOptions marca a categoria selecionada e separa por tipo", () => {
  const a = env();
  const html = a.catOptions("d", "mer");
  assert.match(html, /selected/);
  assert.match(html, /Mercado/);
  assert.ok(!html.includes("Salário"), "categoria de receita não entra na lista de despesa");
});

test("svg devolve ícone para cada item da navegação", () => {
  const a = env();
  for (const k of ["geral", "lanc", "fluxo", "contas", "cats", "check", "prev", "next"]) {
    assert.match(a.svg(k), /^<svg/, k);
  }
});

test("TITLES cobre todas as telas", () => {
  const a = env();
  for (const v of Object.keys(a.VIEWS)) assert.ok(a.TITLES[v], "falta título de " + v);
});

/* ---------- robustez com dado hostil ---------- */

test("nome de conta e categoria são escapados nas telas", () => {
  const a = env([], [manual()], [{ id: "cc", nome: '<img onerror=x>', saldoInicial: 0, cor: "#111111" }]);
  for (const nome of ["contas", "lanc"]) {
    const html = a.VIEWS[nome]();
    assert.ok(!html.includes("<img onerror"), nome + " deixou passar HTML");
  }
});

test("cor forjada não escapa do atributo em contas nem em categorias", () => {
  /* O seletor é <input type="color">, mas o valor vem do estado sincronizado:
     sem passar pelo filtro de hexadecimal, `" onload="x` fecha o atributo e
     injeta um handler. */
  const veneno = '" onload="x';
  const a = env([], [manual({ cat: "mer" })], [{ id: "cc", nome: "CC", saldoInicial: 0, cor: veneno }]);
  assert.ok(!a.viewContas().includes("onload="), "escapou pela cor da conta");

  const b = env([], [manual({ cat: "mer" })]);
  const S = b.set;
  b.seedEstado([manual({ cat: "mer" })]);
  const est = b.VIEWS; // força uso do estado já montado
  b.set("S", Object.assign({}, { v: 1, rev: 1, sample: false,
    accounts: [{ id: "cc", nome: "CC", saldoInicial: 0, cor: "#111111" }],
    categories: [{ id: "mer", nome: "Mercado", tipo: "d", cor: veneno }],
    tx: [] }));
  assert.ok(!b.viewCats().includes("onload="), "escapou pela cor da categoria");
});

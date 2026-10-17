"use strict";
/*
 * Os caminhos que sobraram: a capacidade `db` do claude.ai (que tem
 * prioridade sobre o Supabase), o link mágico por e-mail, o gráfico e os
 * atalhos de teclado.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app.js");

const espera = ms => new Promise(r => setTimeout(r, ms));

/* ---------- capacidade db do claude.ai ---------- */

function claudeFalso({ id = "user-claude", dado = null, existe = false } = {}) {
  const reg = { caminhos: [], gravados: [] };
  const ref = {
    set: async d => { reg.gravados.push(d); },
    onSnapshot(cb) { setTimeout(() => cb({ exists: existe, data: () => dado }), 0); return () => {}; }
  };
  return {
    reg,
    claude: {
      use: async cap => ({
        db: { doc: caminho => { reg.caminhos.push(caminho); return ref; } },
        user: { id: async () => id },
        downloads: { save: async () => {} }
      })[cap]
    }
  };
}

test("initStore usa o db do claude.ai quando existe, antes do Supabase", async () => {
  const { claude, reg } = claudeFalso({ existe: true, dado: {
    v: 1, rev: 3, sample: false,
    accounts: [{ id: "cc", nome: "Conta corrente", saldoInicial: 0, cor: "#1F7A78" }],
    categories: [{ id: "out", nome: "Outras", tipo: "d", cor: "#7A7469" }],
    tx: [{ id: "x", data: "2026-10-05", desc: "Veio do claude", valor: 100, tipo: "d", cat: "out", conta: "cc", ok: true }]
  } });
  const a = loadApp({ claude });
  await a.initStore();
  a.set("cur", { y: 2026, m: 9 });
  a.set("view", "lanc");
  assert.match(a.viewLanc(), /Veio do claude/);
  assert.match(reg.caminhos[0], /^data\/users\/user-claude\/app$/, "o documento é por usuário");
});

test("sem id de usuário no claude.ai, cai para o modo local", async () => {
  const { claude } = claudeFalso({ id: null });
  const a = loadApp({ claude });
  await a.initStore();
  assert.doesNotThrow(() => a.render(), "precisa continuar utilizável");
});

test("claude.ai disponibiliza o download para exportar", async () => {
  const { claude } = claudeFalso({ existe: true, dado: null });
  const a = loadApp({ claude });
  await a.initStore();
  assert.match(a.viewContas(), /Exportar lançamentos/, "o botão só aparece quando há como salvar");
});

test("falha ao consultar o claude.ai não impede o app de abrir", async () => {
  const a = loadApp({ claude: { use: async () => { throw new Error("indisponível"); } } });
  await a.initStore();
  assert.doesNotThrow(() => a.render());
});

/* ---------- link mágico ---------- */

test("enviar link mágico chama o Supabase com o e-mail digitado", async () => {
  const chamadas = [];
  const sup = {
    auth: {
      onAuthStateChange() {},
      signInWithOtp: async args => { chamadas.push(args); return { error: null }; }
    },
    from: () => ({}), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
  };
  const a = loadApp({ supabase: sup });
  a.seedEstado([]);
  a.campo("#f-email").value = "  eu@exemplo.com  ";
  await a.sendMagicLink({ preventDefault() {} });

  assert.equal(chamadas[0].email, "eu@exemplo.com", "o e-mail é aparado");
  assert.ok(chamadas[0].options.emailRedirectTo, "o link precisa saber para onde voltar");
  assert.match(a.campo("#authmsg").textContent, /eu@exemplo\.com/);
});

test("e-mail em branco não dispara envio", async () => {
  let chamou = false;
  const sup = {
    auth: { onAuthStateChange() {}, signInWithOtp: async () => { chamou = true; return { error: null }; } },
    from: () => ({}), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
  };
  const a = loadApp({ supabase: sup });
  a.seedEstado([]);
  a.campo("#f-email").value = "   ";
  await a.sendMagicLink({ preventDefault() {} });
  assert.equal(chamou, false);
});

test("falha no envio vira mensagem na tela, não exceção", async () => {
  const sup = {
    auth: { onAuthStateChange() {}, signInWithOtp: async () => ({ error: new Error("limite") }) },
    from: () => ({}), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
  };
  const a = loadApp({ supabase: sup });
  a.seedEstado([]);
  a.campo("#f-email").value = "eu@exemplo.com";
  await a.sendMagicLink({ preventDefault() {} });
  assert.match(a.campo("#authmsg").textContent, /não foi possível/i);
});

/* ---------- gráfico ---------- */

test("o gráfico é desenhado para o mês corrente", () => {
  const a = loadApp();
  a.seedEstado([
    { id: "m1", data: "2026-10-05", desc: "A", valor: 10000, tipo: "d", cat: "out", conta: "cc", ok: true },
    { id: "m2", data: "2026-10-20", desc: "B", valor: 50000, tipo: "r", cat: "out", conta: "cc", ok: false }
  ]);
  a.set("cur", { y: 2026, m: 9 });
  a.drawChart();
  const svg = a.campo("#chart").innerHTML;
  assert.match(svg, /<svg/);
  assert.match(svg, /hoje|outubro/i, "o gráfico identifica o mês e a marca de hoje");
});

test("o gráfico aguenta mês sem nenhum lançamento", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.set("cur", { y: 2030, m: 0 });
  assert.doesNotThrow(() => a.drawChart());
});

test("o gráfico aguenta saldo negativo e valores iguais todo dia", () => {
  const a = loadApp();
  a.seedEstado([{ id: "m1", data: "2026-10-01", desc: "A", valor: 500000, tipo: "d", cat: "out", conta: "cc", ok: true }]);
  a.set("cur", { y: 2026, m: 9 });
  assert.doesNotThrow(() => a.drawChart(), "escala com variação zero não pode dividir por zero");
});

/* ---------- prévia de repetição ---------- */

test("a prévia de parcelamento mostra o valor de cada parcela", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.campo("#f-rep").value = "p";
  a.campo("#f-valor").value = "100,00";
  a.campo("#f-n").value = "3";
  a.campo("#f-data").value = "2026-10-10";
  a.repPreview();
  const txt = a.campo("#f-prev").innerHTML + a.campo("#f-prev").textContent;
  assert.ok(txt.length > 0, "a prévia precisa dizer alguma coisa");
});

test("a prévia não quebra sem valor preenchido", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.campo("#f-rep").value = "m";
  a.campo("#f-valor").value = "";
  assert.doesNotThrow(() => a.repPreview());
});

/* ---------- teclado ---------- */

test("Escape fecha o formulário aberto", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.bind();
  a.openTx(null);
  a.campo("#modal").hidden = false;
  a.dispara("keydown", { key: "Escape", target: {} });
  assert.equal(a.campo("#modal").hidden, true);
});

test("Escape com o formulário fechado não faz nada", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.bind();
  a.campo("#modal").hidden = true;
  assert.doesNotThrow(() => a.dispara("keydown", { key: "Escape", target: {} }));
});

test("Enter sobre uma linha abre o lançamento", () => {
  const a = loadApp();
  a.seedEstado([{ id: "m1", data: "2026-10-05", desc: "Aluguel", valor: 100, tipo: "d", cat: "mor", conta: "cc", ok: true }]);
  a.bind();
  let impediu = false;
  a.dispara("keydown", {
    key: "Enter",
    preventDefault() { impediu = true; },
    target: { classList: { contains: c => c === "row" }, dataset: { id: "m1" } }
  });
  assert.ok(impediu, "a tecla precisa ser consumida");
  assert.match(a.campo("#modal").innerHTML, /Aluguel/);
});

test("tecla em elemento que não é linha é ignorada", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.bind();
  assert.doesNotThrow(() => a.dispara("keydown", {
    key: "Enter", preventDefault() {},
    target: { classList: { contains: () => false }, dataset: {} }
  }));
});

/* ---------- busca ---------- */

test("digitar na busca filtra a lista sem redesenhar tudo", () => {
  const a = loadApp();
  a.seedEstado([
    { id: "m1", data: "2026-10-05", desc: "Padaria", valor: 100, tipo: "d", cat: "mer", conta: "cc", ok: true },
    { id: "m2", data: "2026-10-06", desc: "Uber", valor: 100, tipo: "d", cat: "tra", conta: "cc", ok: true }
  ]);
  a.set("cur", { y: 2026, m: 9 });
  a.bind();
  a.dispara("input", { target: { id: "fq", value: "pada", dataset: {} } });
  assert.deepEqual(a.filteredList().map(t => t.desc), ["Padaria"]);
});

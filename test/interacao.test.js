"use strict";
/*
 * Camada de interação: transições de login, delegação de eventos e
 * exportação. São caminhos que só rodam quando alguém clica — justamente os
 * que passam despercebidos até quebrarem em produção.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app.js");

const espera = ms => new Promise(r => setTimeout(r, ms));

/* Supabase falso que guarda o callback de mudança de sessão, para o teste
   simular login, logout e vinculação de provedor. */
function supabaseComAuth(extra) {
  const reg = { callback: null, chamadas: [], canaisRemovidos: 0 };
  const sup = Object.assign({
    auth: {
      onAuthStateChange(cb) { reg.callback = cb; },
      signOut() { reg.chamadas.push(["signOut"]); },
      signInWithOAuth(args) { reg.chamadas.push(["signInWithOAuth", args]); return Promise.resolve({}); },
      linkIdentity(args) { reg.chamadas.push(["linkIdentity", args]); return Promise.resolve({}); },
      signInWithOtp(args) { reg.chamadas.push(["signInWithOtp", args]); return Promise.resolve({ error: null }); }
    },
    from: () => ({
      select: () => ({ eq: () => ({
        order: () => ({
          range: async () => ({ data: [], error: null }),
          limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) })
        }),
        maybeSingle: async () => ({ data: null, error: null })
      }) }),
      upsert: async () => ({ error: null })
    }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() { reg.canaisRemovidos++; }
  }, extra);
  return { sup, reg };
}

function comAuth() {
  const { sup, reg } = supabaseComAuth();
  const a = loadApp({ supabase: sup });
  a.seedEstado([]);
  a.setupAuth();                   // registra o ouvinte
  reg.callback("INITIAL_SESSION", null);   // a primeira chamada só resolve a promessa
  return { a, reg };
}

/* ---------- transições de sessão ---------- */

test("entrar conecta a sincronização e guarda o usuário", async () => {
  const { a, reg } = comAuth();
  reg.callback("SIGNED_IN", { user: { id: "u1", email: "eu@exemplo.com", identities: [{ provider: "email" }] } });
  await espera(30);
  assert.match(a.syncPanel(), /eu@exemplo\.com/);
});

test("sair limpa a sessão, o cartão e encerra o canal", async () => {
  const { a, reg } = comAuth();
  reg.callback("SIGNED_IN", { user: { id: "u1", email: "eu@exemplo.com", identities: [] } });
  await espera(30);
  reg.callback("SIGNED_OUT", null);
  await espera(10);
  assert.match(a.syncPanel(), /Enviar link de acesso/, "volta a oferecer login");
  assert.equal(a.txs("nubank").length, 0, "as transações do cartão saem da memória");
  assert.ok(reg.canaisRemovidos > 0, "o canal do cartão precisa ser encerrado");
});

test("vincular o Google atualiza a tela sem trocar de sessão", async () => {
  /* linkIdentity dispara USER_UPDATED, não SIGNED_IN: o user_id não muda. Sem
     tratar esse evento, o botão "Conectar Google" ficaria na tela até alguém
     recarregar a página. */
  const { a, reg } = comAuth();
  reg.callback("SIGNED_IN", { user: { id: "u1", email: "eu@exemplo.com", identities: [{ provider: "email" }] } });
  await espera(30);
  assert.match(a.syncPanel(), /Conectar Google/);

  reg.callback("USER_UPDATED", { user: { id: "u1", email: "eu@exemplo.com", identities: [{ provider: "email" }, { provider: "google" }] } });
  await espera(10);
  assert.ok(!a.syncPanel().includes("Conectar Google"), "o botão some sozinho");
});

test("entrar de novo com o mesmo usuário não reconecta à toa", async () => {
  const { a, reg } = comAuth();
  const sessao = { user: { id: "u1", email: "eu@exemplo.com", identities: [] } };
  reg.callback("SIGNED_IN", sessao);
  await espera(30);
  const antes = reg.canaisRemovidos;
  reg.callback("SIGNED_IN", sessao);
  await espera(10);
  assert.equal(reg.canaisRemovidos, antes);
});

/* ---------- botões de conta ---------- */

test("os botões de login chamam o método certo do Supabase", async () => {
  const { sup, reg } = supabaseComAuth();
  const a = loadApp({ supabase: sup });
  a.seedEstado([]);

  a.H.googleSignin();
  a.H.googleLink();
  a.H.signout();

  const nomes = reg.chamadas.map(c => c[0]);
  assert.deepEqual(nomes, ["signInWithOAuth", "linkIdentity", "signOut"]);
  for (const [nome, args] of reg.chamadas.slice(0, 2)) {
    assert.equal(args.provider, "google", nome);
    assert.ok(args.options.redirectTo, nome + " precisa dizer para onde voltar");
  }
});

/* ---------- delegação de eventos ---------- */

test("clique em elemento com data-act chama o handler correspondente", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.bind();
  let chamou = null;
  a.H.__teste = el => { chamou = el.dataset.id; };
  const alvo = { dataset: { act: "__teste", id: "abc" } };
  a.dispara("click", { target: { id: "", closest: () => alvo } });
  assert.equal(chamou, "abc");
});

test("clique sem data-act ou com ação desconhecida é ignorado", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.bind();
  assert.doesNotThrow(() => a.dispara("click", { target: { id: "", closest: () => null } }));
  assert.doesNotThrow(() => a.dispara("click", { target: { id: "", closest: () => ({ dataset: { act: "inexistente" } }) } }));
});

test("mudar o filtro de conta redesenha a tela", () => {
  const a = loadApp();
  a.seedEstado([{ id: "m1", data: "2026-10-10", desc: "X", valor: 100, tipo: "d", cat: "out", conta: "cc", ok: true }]);
  a.bind();
  a.dispara("change", { target: { dataset: { f: "conta" }, value: "nubank" } });
  assert.equal(a.txs("nubank").length, 0, "o filtro foi aplicado sem quebrar");
});

test("renomear conta pelo campo da tela persiste o nome", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.bind();
  a.dispara("change", { target: { dataset: { acc: "cc", k: "nome" }, value: "  Banco Novo  " } });
  assert.match(a.viewContas(), /Banco Novo/);
});

test("nome em branco não apaga o nome da conta", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.bind();
  a.dispara("change", { target: { dataset: { acc: "cc", k: "nome" }, value: "   " } });
  assert.match(a.viewContas(), /Conta corrente/, "mantém o nome anterior");
});

test("saldo inicial inválido é recusado em silêncio", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.bind();
  a.dispara("change", { target: { dataset: { acc: "cc", k: "saldo" }, value: "1.234,56" } });
  assert.equal(a.opening("cc"), 123456);
  a.dispara("change", { target: { dataset: { acc: "cc", k: "saldo" }, value: "abc" } });
  assert.equal(a.opening("cc"), 123456, "o valor bom não pode ser perdido");
});

test("renomear categoria pelo campo da tela", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.bind();
  a.dispara("change", { target: { dataset: { cat: "mer", k: "nome" }, value: "Supermercado" } });
  assert.match(a.viewCats(), /Supermercado/);
});

test("mudança em conta ou categoria inexistente não quebra", () => {
  const a = loadApp();
  a.seedEstado([]);
  a.bind();
  assert.doesNotThrow(() => a.dispara("change", { target: { dataset: { acc: "fantasma", k: "nome" }, value: "x" } }));
  assert.doesNotThrow(() => a.dispara("change", { target: { dataset: { cat: "fantasma", k: "nome" }, value: "x" } }));
});

/* ---------- exportação ---------- */

test("exporta CSV com cabeçalho, BOM e ponto e vírgula", async () => {
  const a = loadApp();
  a.seedEstado([{ id: "m1", data: "2026-10-05", desc: "Mercado", valor: 12345, tipo: "d", cat: "mer", conta: "cc", ok: true }]);
  let salvo = null;
  a.set("downloads", { save: async arq => { salvo = arq; } });
  await a.H.export();
  assert.match(salvo.filename, /^aje-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.ok(salvo.data.startsWith("﻿"), "o BOM é o que faz o Excel ler acento certo");
  const linhas = salvo.data.replace("﻿", "").split("\r\n");
  assert.equal(linhas[0], '"Data";"Descrição";"Tipo";"Valor";"Categoria";"Conta";"Status";"Parcela"');
  assert.equal(linhas[1], '"2026-10-05";"Mercado";"Despesa";"-123,45";"Mercado";"Conta corrente";"Realizado";""');
});

test("aspas na descrição são duplicadas para não quebrar o CSV", () => {
  const a = loadApp();
  a.seedEstado([{ id: "m1", data: "2026-10-05", desc: 'Caf" da manhã', valor: 100, tipo: "d", cat: "out", conta: "cc", ok: true }]);
  let salvo = null;
  a.set("downloads", { save: async arq => { salvo = arq; } });
  return a.H.export().then(() => {
    assert.ok(salvo.data.includes('"Caf"" da manhã"'), "aspas precisam ser escapadas, senão a coluna vaza");
  });
});

test("a exportação traz as compras do cartão, não a fatura agregada", async () => {
  /* O CSV é o extrato completo: quem exporta quer os fatos, não o resumo. */
  const a = loadApp();
  a.seedEstado([{ id: "m1", data: "2026-01-01", desc: "Manual", valor: 100, tipo: "d", cat: "out", conta: "cc", ok: true }]);
  a.set("pluggyTx", [{ id: "pg-1", data: "2026-10-05", desc: "iFood", valor: 4590, tipo: "d",
    cat: "res", conta: "nubank", ok: true, imported: true, fatura: "2026-10", pagamento: false }]);
  let salvo = null;
  a.set("downloads", { save: async arq => { salvo = arq; } });
  await a.H.export();
  assert.match(salvo.data, /iFood/);
  assert.ok(!salvo.data.includes("Fatura Nubank"));
});

test("exportação ordena por data", async () => {
  const a = loadApp();
  a.seedEstado([
    { id: "m2", data: "2026-10-20", desc: "Depois", valor: 100, tipo: "d", cat: "out", conta: "cc", ok: true },
    { id: "m1", data: "2026-10-05", desc: "Antes", valor: 100, tipo: "d", cat: "out", conta: "cc", ok: true }
  ]);
  let salvo = null;
  a.set("downloads", { save: async arq => { salvo = arq; } });
  await a.H.export();
  assert.ok(salvo.data.indexOf("Antes") < salvo.data.indexOf("Depois"));
});

test("cancelar o salvamento não vira erro na tela", async () => {
  const a = loadApp();
  a.seedEstado([]);
  a.set("downloads", { save: async () => { const e = new Error("cancelado"); e.code = "declined"; throw e; } });
  await assert.doesNotReject(() => a.H.export());
});

test("falha ao exportar é tratada", async () => {
  const a = loadApp();
  a.seedEstado([]);
  a.set("downloads", { save: async () => { throw new Error("disco cheio"); } });
  await assert.doesNotReject(() => a.H.export());
});

/* ---------- formulário ---------- */

test("abrir o formulário vazio prepara um lançamento novo", () => {
  const a = loadApp();
  a.seedEstado([]);
  assert.doesNotThrow(() => a.openTx(null));
  assert.doesNotThrow(() => a.closeModal());
});

test("abrir o formulário de um lançamento existente carrega os dados dele", () => {
  const a = loadApp();
  a.seedEstado([{ id: "m1", data: "2026-10-05", desc: "Aluguel", valor: 185000, tipo: "d", cat: "mor", conta: "cc", ok: true }]);
  assert.doesNotThrow(() => a.openTx("m1"));
  assert.match(a.campo("#modal").innerHTML, /Aluguel/);
});

test("abrir formulário com id inexistente não quebra", () => {
  const a = loadApp();
  a.seedEstado([]);
  assert.doesNotThrow(() => a.openTx("nao-existe"));
});

test("confirmar exclusão monta as opções certas para série e avulso", () => {
  const a = loadApp();
  a.seedEstado([
    { id: "m1", data: "2026-10-05", desc: "Avulso", valor: 100, tipo: "d", cat: "out", conta: "cc", ok: true },
    { id: "m2", data: "2026-10-06", desc: "Série", valor: 100, tipo: "d", cat: "out", conta: "cc", ok: true, grupo: "g1", rep: "m" }
  ]);
  /* askDelete reescreve o rodapé da folha, não o modal inteiro. */
  a.openTx("m2"); a.askDelete();
  assert.match(a.campo(".sheetfoot").innerHTML, /Este e os próximos/, "série oferece apagar o resto");

  a.openTx("m1"); a.askDelete();
  assert.ok(!a.campo(".sheetfoot").innerHTML.includes("Este e os próximos"));
  assert.match(a.campo(".sheetfoot").innerHTML, /Excluir</, "avulso tem só um botão");
});

/* ---------- avisos ---------- */

test("toast não quebra e pode ser chamado em sequência", () => {
  const a = loadApp();
  a.seedEstado([]);
  assert.doesNotThrow(() => { a.toast("Um"); a.toast("Dois"); });
});

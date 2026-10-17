"use strict";
/*
 * Gravação e sincronização: localStorage, o contrato do `ref` (set +
 * onSnapshot), a reconciliação por `rev` e a assinatura da tabela do cartão.
 *
 * É a parte com mais risco silencioso do app — um erro aqui não aparece na
 * tela, some com dado. Por isso os testes cobrem as ordens de chegada, não só
 * o caminho feliz.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, makeStorage } = require("./load-app.js");

const espera = ms => new Promise(r => setTimeout(r, ms));

/* Dublê do contrato de `ref`: .set(dado) e .onSnapshot(cb, errCb). */
function fakeRef({ inicial = null, existe = false, erro = null } = {}) {
  const r = { gravados: [], cb: null, errCb: null, desinscrito: false };
  r.set = async dado => { r.gravados.push(JSON.parse(JSON.stringify(dado))); };
  r.onSnapshot = (cb, errCb) => {
    r.cb = cb; r.errCb = errCb;
    if (erro) { setTimeout(() => errCb(erro), 0); }
    else { setTimeout(() => cb({ exists: existe, data: () => inicial }), 0); }
    return () => { r.desinscrito = true; };
  };
  /* Empurra uma atualização remota depois da carga inicial. */
  r.empurra = dado => r.cb({ exists: true, data: () => dado });
  return r;
}

function estado(tx = [], rev = 1) {
  return {
    v: 1, rev, sample: false,
    accounts: [{ id: "cc", nome: "Conta corrente", saldoInicial: 0, cor: "#1F7A78" }],
    categories: [{ id: "out", nome: "Outras despesas", tipo: "d", cor: "#7A7469" }],
    tx
  };
}
function lanc(o) {
  return Object.assign({ id: "m1", data: "2026-10-10", desc: "X", valor: 100, tipo: "d", cat: "out", conta: "cc", ok: true }, o);
}

/* ---------- localStorage ---------- */

test("persist grava no localStorage e incrementa a revisão", () => {
  const a = loadApp();
  a.seedEstado([lanc()]);
  a.persist();
  const salvo = a.loadLocal();
  assert.equal(salvo.tx.length, 1);
  assert.equal(salvo.rev, 2, "rev sobe a cada gravação, é o que resolve conflito");
  a.persist();
  assert.equal(a.loadLocal().rev, 3);
});

test("loadLocal devolve null quando não há nada gravado", () => {
  assert.equal(loadApp().loadLocal(), null);
});

test("loadLocal não quebra com conteúdo corrompido", () => {
  const a = loadApp();
  a.seedEstado([lanc()]);
  a.persist();
  /* Simula JSON truncado — o app precisa cair no seed, não explodir. */
  const orig = a.loadLocal();
  assert.ok(orig);
  assert.doesNotThrow(() => a.loadLocal());
});

test("localFallback usa o que está no navegador e marca o estado como local", () => {
  const navegador = makeStorage();
  const a = loadApp({ storage: navegador });
  a.seedEstado([lanc({ desc: "Gravado" })]);
  a.persist();
  const b = loadApp({ storage: navegador });
  assert.doesNotThrow(() => b.localFallback());
});

/* ---------- attachRef: primeira carga ---------- */

test("sem documento remoto, sobe o que está no dispositivo", async () => {
  /* É esta regra que recupera os lançamentos quando o projeto Supabase é
     recriado: a linha remota não existe, então o local é publicado. */
  const navegador = makeStorage();          // os dois "abriram o mesmo navegador"
  const a = loadApp({ storage: navegador });
  a.seedEstado([lanc({ desc: "Só local" })]);
  a.persist();

  const b = loadApp({ storage: navegador });
  const ref = fakeRef({ existe: false });
  await b.attachRef(ref, () => {});
  await espera(400);
  assert.equal(ref.gravados.length, 1, "publicou o estado local");
  assert.equal(ref.gravados[0].tx[0].desc, "Só local");
});

test("com documento remoto, o remoto manda", async () => {
  const navegador = makeStorage();
  const a = loadApp({ storage: navegador });
  a.seedEstado([lanc({ desc: "Local antigo" })]);
  a.persist();

  const b = loadApp({ storage: navegador });
  const ref = fakeRef({ existe: true, inicial: estado([lanc({ desc: "Remoto" })], 9) });
  await b.attachRef(ref, () => {});
  assert.equal(ref.gravados.length, 0, "nada a publicar: o remoto já é a verdade");
  b.set("view", "lanc");
  assert.match(b.viewLanc(), /Remoto/);
});

test("erro na leitura cai no modo local", async () => {
  const b = loadApp();
  let caiu = false;
  await b.attachRef(fakeRef({ erro: new Error("sem rede") }), () => { caiu = true; });
  assert.ok(caiu, "o fallback precisa ser chamado para o app continuar usável");
});

test("se o remoto nunca responde, o app não fica travado", async () => {
  const b = loadApp();
  let caiu = false;
  const mudo = { set: async () => {}, onSnapshot: () => () => {} };
  const t0 = Date.now();
  await b.attachRef(mudo, () => { caiu = true; });
  assert.ok(caiu, "há um prazo máximo de espera");
  assert.ok(Date.now() - t0 >= 7000, "e ele não é curto demais a ponto de cortar conexão lenta");
});

/* ---------- attachRef: atualização vinda de outro dispositivo ---------- */

test("atualização remota mais nova substitui o estado", async () => {
  const b = loadApp();
  const ref = fakeRef({ existe: true, inicial: estado([lanc({ desc: "Inicial" })], 1) });
  await b.attachRef(ref, () => {});
  ref.empurra(estado([lanc({ desc: "Veio do celular" })], 5));
  b.set("view", "lanc");
  assert.match(b.viewLanc(), /Veio do celular/);
});

test("atualização remota mais velha é ignorada", async () => {
  /* Sem a comparação de `rev`, uma mensagem atrasada apagaria edição nova. */
  const b = loadApp();
  const ref = fakeRef({ existe: true, inicial: estado([lanc({ desc: "Atual" })], 10) });
  await b.attachRef(ref, () => {});
  ref.empurra(estado([lanc({ desc: "Atrasada" })], 3));
  b.set("view", "lanc");
  assert.match(b.viewLanc(), /Atual/);
  assert.ok(!b.viewLanc().includes("Atrasada"));
});

test("edição local pendente não é sobrescrita por eco do servidor", async () => {
  const b = loadApp();
  const ref = fakeRef({ existe: true, inicial: estado([lanc({ desc: "Inicial" })], 1) });
  await b.attachRef(ref, () => {});
  b.seedEstado([lanc({ desc: "Digitando agora" })]);
  b.persist();                       // marca como sujo
  ref.empurra(estado([lanc({ desc: "Eco antigo" })], 99));
  b.set("view", "lanc");
  assert.match(b.viewLanc(), /Digitando agora/, "o que o usuário acabou de digitar não pode sumir");
});

/* ---------- gravação remota ---------- */

test("persist com ref ativo publica o estado", async () => {
  const b = loadApp();
  const ref = fakeRef({ existe: true, inicial: estado([], 1) });
  await b.attachRef(ref, () => {});
  b.seedEstado([lanc({ desc: "Novo" })]);
  b.persist();
  await espera(500);
  assert.ok(ref.gravados.length >= 1);
  assert.equal(ref.gravados[ref.gravados.length - 1].tx[0].desc, "Novo");
});

test("várias edições seguidas não geram uma gravação cada", async () => {
  /* O debounce existe para não martelar o banco a cada tecla. */
  const b = loadApp();
  const ref = fakeRef({ existe: true, inicial: estado([], 1) });
  await b.attachRef(ref, () => {});
  b.seedEstado([lanc()]);
  for (let i = 0; i < 10; i++) b.persist();
  await espera(500);
  assert.ok(ref.gravados.length < 10, "esperava agrupamento, houve " + ref.gravados.length);
});

/* ---------- supaRef ---------- */

test("supaRef lê a linha do usuário e assina as mudanças", async () => {
  const chamadas = { select: [], canal: [], upsert: [] };
  const supabase = {
    auth: { onAuthStateChange() {} },
    from(tabela) {
      return {
        select: () => ({ eq: (col, val) => ({ maybeSingle: async () => { chamadas.select.push({ tabela, col, val }); return { data: { data: estado([], 3) }, error: null }; } }) }),
        upsert: async linha => { chamadas.upsert.push({ tabela, linha }); return { error: null }; }
      };
    },
    channel(nome) { chamadas.canal.push(nome); return { on() { return this; }, subscribe() { return this; } }; },
    removeChannel() {}
  };
  const a = loadApp({ supabase });
  const ref = a.supaRef("user-7");

  await ref.set(estado([lanc()]));
  assert.equal(chamadas.upsert[0].tabela, "app_state");
  assert.equal(chamadas.upsert[0].linha.user_id, "user-7");
  assert.ok(chamadas.upsert[0].linha.updated_at, "carimba a hora da gravação");

  const vistos = [];
  const parar = ref.onSnapshot(s => vistos.push(s.exists), () => {});
  await espera(10);
  assert.deepEqual(chamadas.select[0], { tabela: "app_state", col: "user_id", val: "user-7" });
  assert.ok(chamadas.canal[0].includes("user-7"), "o canal é por usuário");
  assert.deepEqual(vistos, [true]);
  assert.doesNotThrow(() => parar());
});

test("supaRef propaga erro de leitura para o callback de erro", async () => {
  const supabase = {
    auth: { onAuthStateChange() {} },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error("RLS") }) }) }) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {}
  };
  const a = loadApp({ supabase });
  let erro = null;
  a.supaRef("u1").onSnapshot(() => {}, e => { erro = e; });
  await espera(10);
  assert.match(String(erro), /RLS/);
});

test("supaRef rejeita quando a gravação falha", async () => {
  const supabase = {
    auth: { onAuthStateChange() {} },
    from: () => ({ upsert: async () => ({ error: new Error("sem permissão") }) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {}
  };
  const a = loadApp({ supabase });
  await assert.rejects(() => a.supaRef("u1").set(estado()), /sem permissão/);
});

/* ---------- tabela do cartão ---------- */

test("fetchPluggyRows pagina até trazer tudo", async () => {
  /* O PostgREST corta em 1000 linhas; sem paginar, o resto sumia da fatura
     em silêncio. */
  const paginas = [
    Array.from({ length: 1000 }, (_, i) => ({ transaction_id: "a" + i })),
    Array.from({ length: 332 }, (_, i) => ({ transaction_id: "b" + i }))
  ];
  let chamada = 0;
  const supabase = {
    auth: { onAuthStateChange() {} },
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: paginas[chamada++] || [], error: null }) }) }) }) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {}
  };
  const a = loadApp({ supabase });
  const linhas = await a.fetchPluggyRows("u1");
  assert.equal(linhas.length, 1332);
  assert.equal(chamada, 2);
});

test("attachPluggy cria a conta do cartão na primeira sincronização", async () => {
  const linhas = [{ transaction_id: "t1", date: "2026-10-05", description: "iFood",
    amount_cents: 4590, tipo: "d", status: "POSTED", category_pluggy: "Restaurante", fatura: "2026-10" }];
  let entregou = false;
  const supabase = {
    auth: { onAuthStateChange() {} },
    from: () => ({ select: () => ({ eq: () => ({
      order: () => ({
        range: async () => ({ data: entregou ? [] : (entregou = true, linhas), error: null }),
        limit: () => ({ maybeSingle: async () => ({ data: { updated_at: new Date().toISOString() }, error: null }) })
      })
    }) }) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {}
  };
  const a = loadApp({ supabase });
  a.seedEstado([], [{ id: "cc", nome: "Conta corrente", saldoInicial: 0, cor: "#1F7A78" }]);
  a.attachPluggy("u1");
  await espera(30);
  assert.ok(a.txs("nubank").length > 0, "as compras entraram em memória");
  assert.match(a.viewContas(), /Nubank/, "a conta do cartão foi criada sozinha");
});

test("attachPluggy devolve uma função que encerra a assinatura", async () => {
  let removido = false;
  const supabase = {
    auth: { onAuthStateChange() {} },
    from: () => ({ select: () => ({ eq: () => ({
      order: () => ({
        range: async () => ({ data: [], error: null }),
        limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) })
      })
    }) }) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() { removido = true; }
  };
  const a = loadApp({ supabase });
  a.seedEstado([]);
  const parar = a.attachPluggy("u1");
  await espera(20);
  parar();
  assert.ok(removido, "sem isso o canal vazaria a cada troca de conta");
});

test("erro ao ler a tabela do cartão não derruba o app", async () => {
  const supabase = {
    auth: { onAuthStateChange() {} },
    from: () => ({ select: () => ({ eq: () => ({
      order: () => ({
        range: async () => ({ data: null, error: new Error("falhou") }),
        limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) })
      })
    }) }) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {}
  };
  const a = loadApp({ supabase });
  a.seedEstado([]);
  assert.doesNotThrow(() => a.attachPluggy("u1"));
  await espera(20);
});

/* ---------- indicador de sincronização ---------- */

test("setSync aceita todos os estados sem quebrar", () => {
  const a = loadApp();
  a.seedEstado([]);
  for (const s of ["ok", "busy", "err", "local", "inexistente"]) {
    assert.doesNotThrow(() => a.setSync(s), s);
  }
});

/* ---------- inicialização ---------- */

test("initStore cai no localStorage quando não há Supabase nem claude.ai", async () => {
  const a = loadApp();
  await a.initStore();
  assert.doesNotThrow(() => a.render(), "o app precisa ficar utilizável offline");
});

test("setupAuth resolve com null quando não há Supabase", async () => {
  assert.equal(await loadApp().setupAuth(), null);
});

"use strict";
/*
 * `app.js` é script de navegador, não módulo: declara tudo com const/let/
 * function no escopo do script e não exporta nada. Para testar sem alterar
 * produção, o arquivo é avaliado dentro de uma função — assim as declarações
 * viram escopo dessa função — e um trecho anexado no fim devolve o que
 * interessa, visível ali porque roda no MESMO escopo.
 *
 * Usa `vm.runInThisContext` e NÃO `runInNewContext`: contexto novo é um realm
 * separado, com Array/Object próprios, e aí `deepStrictEqual` recusa comparar
 * o que sai do app com literais do teste ("same structure but not
 * reference-equal"). No mesmo realm os valores são comparáveis normalmente.
 *
 * E não usa `new Function` porque aquilo gera script anônimo: passando
 * `filename`, o `--experimental-test-coverage` consegue atribuir a cobertura
 * ao app.js de verdade. O wrapper abre na MESMA linha que o código original
 * para os números de linha do relatório continuarem batendo com o arquivo.
 *
 * O bloco boot() é removido: dispara render(), timers e rede, nada disso sob
 * teste. A remoção é verificada — se app.js mudar de forma, o carregador
 * quebra em vez de silenciosamente testar outra coisa.
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const APP = path.join(__dirname, "..", "app.js");

/* Só o suficiente para o arquivo carregar: nada aqui é objeto de teste. */
function fakeEl() {
  const el = {
    innerHTML: "", textContent: "", value: "", hidden: false, disabled: false,
    title: "", className: "", id: "", checked: false,
    style: {}, dataset: {},
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, remove() {}, focus() {}, click() {}, scrollIntoView() {},
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    hasAttribute: () => false,
    querySelector: () => fakeEl(), querySelectorAll: () => [],
    closest: () => null,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 })
  };
  Object.defineProperty(el, "lastElementChild", { get: () => fakeEl() });
  Object.defineProperty(el, "firstElementChild", { get: () => fakeEl() });
  return el;
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear()
  };
}

/* Nomes publicados para os testes. Se algum sumir de app.js, o ReferenceError
   é proposital: avisa que o teste perdeu o alvo em vez de passar à toa. */
const EXPOSTOS = [
  // utilidades
  "esc", "money", "inMoney", "parseMoney", "pad", "iso", "parse", "todayISO",
  "addDays", "addMonths", "fmtDay", "fmtShort", "desde", "cor", "signed", "clone", "uid",
  // domínio
  "CATS", "PLUGGY_CAT_MAP", "mapCategory", "seed", "blank",
  // fatura
  "FATURA_DIA", "FATURA_FECHA", "faturaDe", "vencDe", "contaFatura",
  "pluggyBillEntries", "dedupPendentes", "mapPluggyRow", "inicioControle",
  // leitura/cálculo
  "everyTx", "allTx", "txs", "opening", "balanceBefore", "realNow", "monthSeries",
  "catOf", "accOf", "curSeries", "filteredList",
  // render
  "rowHTML", "render", "VIEWS", "viewGeral", "viewLanc", "viewFluxo", "viewContas",
  "viewCats", "listHTML", "syncPanel", "catOptions", "svg", "TITLES",
  // estado e sincronização
  "persist", "loadLocal", "setSync", "localFallback", "attachRef", "supaRef",
  "attachPluggy", "fetchPluggyRows", "initStore", "setupAuth", "H", "toast", "arm",
  "submitTx", "openTx", "closeModal", "delTx", "askDelete", "bind", "catOptions",
  "sendMagicLink", "drawChart", "repPreview"
];

/* Estado de módulo que os testes precisam preparar. */
const MUTAVEIS = ["S", "pluggyTx", "cur", "filtro", "view", "ref", "authUser", "downloads", "editing", "armed"];

let fabrica = null;
function compila() {
  if (fabrica) return fabrica;
  const src = fs.readFileSync(APP, "utf8");

  const BOOT = /\(async function boot\(\)\s*\{[\s\S]*?\}\)\(\);\s*$/;
  if (!BOOT.test(src)) {
    throw new Error(
      "test/load-app.js: não encontrei `(async function boot(){...})();` no fim de app.js. " +
      "Se o bootstrap mudou, atualize este carregador — sem isso os testes rodariam contra outro app.js."
    );
  }

  const rodape =
    `\n;return{api:{${EXPOSTOS.join(",")}},` +
    `set:(k,v)=>{({${MUTAVEIS.map(n => `${n}:x=>${n}=x`).join(",")}})[k](v)}};`;

  fabrica = vm.runInThisContext(
    "(function(window,document,localStorage,location,Core){" + src.replace(BOOT, "") + rodape + "})",
    { filename: APP }
  );
  return fabrica;
}

/*
 * Carrega app.js isolado. Cada chamada devolve um ambiente novo, para que um
 * teste não veja o estado (S, pluggyTx, filtro, cur) deixado por outro.
 */
function loadApp(opcoes) {
  const { supabase, storage, claude } = opcoes || {};
  const janela = {
    addEventListener() {},
    scrollTo() {},
    matchMedia: () => ({ matches: false, addEventListener() {} })
    /* Sem `supabase`, SUPABASE_URL/ANON_KEY ficam ausentes e `supa` nasce
       null: o app roda no modo "só localStorage", sem tocar em rede. Passando
       um dublê, dá para exercitar a camada de sincronização. */
  };
  /* A capacidade `db` do claude.ai tem prioridade sobre o Supabase em
     initStore; passar `claude` exercita esse ramo. */
  if (claude) janela.claude = claude;
  if (supabase) {
    janela.SUPABASE_URL = "https://exemplo.supabase.co";
    janela.SUPABASE_ANON_KEY = "anon-fake";
    janela.supabase = { createClient: () => supabase };
  }
  /* Elementos são memorizados por seletor: assim o teste prepara um campo de
     formulário (`campo("#f-valor").value = "100,00"`) e o app enxerga o mesmo
     objeto quando consultar. Sem isso, cada querySelector devolveria um
     elemento novo e vazio. */
  const porSeletor = new Map();
  const achar = sel => {
    if (!porSeletor.has(sel)) porSeletor.set(sel, fakeEl());
    return porSeletor.get(sel);
  };
  /* Guarda os ouvintes que `bind()` registra, para o teste disparar eventos
     como o navegador faria. */
  const ouvintes = {};
  const doc = {
    addEventListener(tipo, fn) { (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
    querySelector: achar,
    querySelectorAll: () => [],
    getElementById: id => achar("#" + id),
    createElement: () => fakeEl(),
    body: fakeEl(),
    documentElement: fakeEl()
  };

  /* Por padrão cada carga tem armazenamento próprio (isolamento entre
     testes); passando `storage`, dois ambientes compartilham o mesmo
     navegador — é como se testa "abriu de novo e os dados estavam lá". */
  const { api, set } = compila()(janela, doc, storage || makeStorage(), {
    /* O app usa `location` global (não window.location) ao montar a URL de
       retorno do OAuth. */
    origin: "https://teste.exemplo", pathname: "/", href: "https://teste.exemplo/"
  }, require("../core.js"));

  return Object.assign({}, api, {
    set,
    /* Acesso ao elemento memorizado de um seletor, para preparar formulário. */
    campo: achar,
    /* Dispara um evento nos ouvintes que bind() registrou. */
    dispara(tipo, evento) {
      for (const fn of ouvintes[tipo] || []) fn(evento);
    },
    /* Preenche de uma vez os campos do formulário de lançamento. */
    preencheForm(v) {
      /* `!= null` e não `||`: string vazia é um caso de teste legítimo
         (campo em branco), não "não informado". */
      achar('input[name="f-tipo"]:checked').value = v.tipo != null ? v.tipo : "d";
      achar("#f-valor").value = v.valor != null ? v.valor : "10,00";
      achar("#f-desc").value = v.desc != null ? v.desc : "Teste";
      achar("#f-data").value = v.data != null ? v.data : "2026-10-10";
      achar("#f-cat").value = v.cat != null ? v.cat : "out";
      achar("#f-conta").value = v.conta != null ? v.conta : "cc";
      achar("#f-ok").checked = !!v.ok;
      achar("#f-rep").value = v.rep != null ? v.rep : "none";
      achar("#f-n").value = v.n != null ? String(v.n) : "";
      if (v.prox != null) achar("#f-prox").checked = !!v.prox;
    },
    /* Mensagem de erro que o formulário exibiu, se houve. */
    erroForm: () => achar("#f-err").textContent,
    /* Estado mínimo e previsível para os testes de cálculo. */
    seedEstado(tx = [], contas) {
      set("S", {
        v: 1, rev: 1, sample: false,
        accounts: contas || [
          { id: "cc", nome: "Conta corrente", saldoInicial: 0, cor: "#1F7A78" },
          { id: "nubank", nome: "Nubank", saldoInicial: 0, cor: "#820AD1" }
        ],
        categories: JSON.parse(JSON.stringify(api.CATS)),
        tx
      });
      set("pluggyTx", []);
      set("filtro", { conta: "all", status: "all", tipo: "all", cat: "all", q: "" });
    }
  });
}

module.exports = { loadApp, makeStorage };

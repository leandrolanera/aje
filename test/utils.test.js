"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app.js");

const a = loadApp();

test("parseMoney desambigua ponto de milhar e ponto decimal pela forma", () => {
  /* A regra existe porque "1.234" de aluguel virava R$ 1,23. Um ponto só,
     seguido de 1 ou 2 dígitos, é decimal; qualquer outra forma é milhar. */
  assert.equal(a.parseMoney("1.23"), 123, "um ponto com 2 casas é decimal");
  assert.equal(a.parseMoney("1.2"), 120, "um ponto com 1 casa é decimal");
  assert.equal(a.parseMoney("1.234"), 123400, "3 casas depois do ponto é milhar");
  assert.equal(a.parseMoney("1.234.567"), 123456700, "vários pontos são milhar");
});

test("parseMoney prioriza a vírgula quando ela aparece", () => {
  assert.equal(a.parseMoney("1,23"), 123);
  assert.equal(a.parseMoney("1.234,56"), 123456);
  assert.equal(a.parseMoney("1.234.567,89"), 123456789);
});

test("parseMoney limpa R$, espaços e aceita negativo", () => {
  assert.equal(a.parseMoney("R$ 1.234,56"), 123456);
  assert.equal(a.parseMoney("  R$10,00 "), 1000);
  assert.equal(a.parseMoney("-5,50"), -550);
});

test("parseMoney devolve NaN para entrada sem número", () => {
  assert.ok(Number.isNaN(a.parseMoney("")));
  assert.ok(Number.isNaN(a.parseMoney("   ")));
  assert.ok(Number.isNaN(a.parseMoney("abc")));
  assert.ok(Number.isNaN(a.parseMoney("R$")));
});

test("parseMoney arredonda para centavo inteiro", () => {
  assert.equal(a.parseMoney("0,005"), 1, "0,005 vira 1 centavo (arredonda)");
  assert.equal(a.parseMoney("0,004"), 0);
});

test("inMoney é o inverso de parseMoney para valores de entrada", () => {
  for (const cents of [0, 1, 99, 100, 123456, -550]) {
    assert.equal(a.parseMoney(a.inMoney(cents)), cents, "ida e volta de " + cents);
  }
});

test("money formata em real com separador pt-BR", () => {
  const s = a.money(123456);
  assert.match(s, /^R\$/);
  assert.ok(s.includes("1.234,56"), "esperava 1.234,56 em " + s);
});

test("addMonths prende no último dia quando o mês destino é mais curto", () => {
  assert.equal(a.addMonths("2026-01-31", 1), "2026-02-28", "31/01 + 1 mês não vaza para março");
  assert.equal(a.addMonths("2024-01-31", 1), "2024-02-29", "ano bissexto");
  assert.equal(a.addMonths("2026-03-31", -1), "2026-02-28", "para trás também");
});

test("addMonths respeita o dia-base quando informado", () => {
  assert.equal(a.addMonths("2026-01-10", 1, 24), "2026-02-24");
  assert.equal(a.addMonths("2026-01-10", 1, 31), "2026-02-28", "dia-base também é preso ao mês");
});

test("addMonths atravessa a virada de ano", () => {
  assert.equal(a.addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(a.addMonths("2026-01-15", -1), "2025-12-15");
});

test("addDays atravessa mês e ano", () => {
  assert.equal(a.addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(a.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(a.addDays("2026-03-01", -1), "2026-02-28");
});

test("iso e parse são simétricos e não deslocam por fuso", () => {
  for (const d of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
    assert.equal(a.iso(a.parse(d)), d);
  }
});

test("fmtShort mostra dia/mês", () => {
  assert.equal(a.fmtShort("2026-10-05"), "05/10");
});

test("esc neutraliza os caracteres que quebrariam o HTML", () => {
  assert.equal(a.esc('<script>'), "&lt;script&gt;");
  assert.equal(a.esc('a&b'), "a&amp;b");
  assert.equal(a.esc('"x"'), "&quot;x&quot;");
  assert.equal(a.esc("'y'"), "&#39;y&#39;");
  assert.equal(a.esc(null), "", "null vira string vazia, não 'null'");
  assert.equal(a.esc(undefined), "");
});

test("cor só deixa passar hexadecimal", () => {
  assert.equal(a.cor("#820AD1"), "#820AD1");
  assert.equal(a.cor("#fff"), "#fff");
  /* Vai para dentro de um atributo style: qualquer coisa fora do formato
     precisa cair no padrão em vez de ser injetada. */
  assert.equal(a.cor("red"), "#6b6350");
  assert.equal(a.cor('" onload="x'), "#6b6350");
  assert.equal(a.cor(null), "#6b6350");
});

test("signed inverte o sinal conforme receita ou despesa", () => {
  assert.equal(a.signed({ tipo: "r", valor: 100 }), 100);
  assert.equal(a.signed({ tipo: "d", valor: 100 }), -100);
});

test("desde mostra tempo relativo até um dia e data cheia depois", () => {
  const agora = Date.now();
  const iso = ms => new Date(agora - ms).toISOString();
  assert.equal(a.desde(iso(30 * 1000)), "agora");
  assert.equal(a.desde(iso(20 * 60000)), "há 20 min");
  assert.equal(a.desde(iso(3 * 3600 * 1000)), "há 3 h");
  assert.match(a.desde(iso(2 * 86400 * 1000)), /^em \d{2}\/\d{2} às \d{2}:\d{2}$/);
});

test("desde não quebra com valor inválido", () => {
  assert.equal(a.desde("xxx"), "");
  assert.equal(a.desde(null), "");
});

test("uid não repete em sequência", () => {
  const vistos = new Set();
  for (let i = 0; i < 500; i++) vistos.add(a.uid());
  assert.equal(vistos.size, 500);
});

test("clone isola o objeto original", () => {
  const orig = { a: 1, b: { c: 2 } };
  const copia = a.clone(orig);
  copia.b.c = 99;
  assert.equal(orig.b.c, 2);
});

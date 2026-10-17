"use strict";
/*
 * Núcleo de domínio do AJÉ: datas, dinheiro, fatura de cartão e saldo.
 *
 * Existe separado do `app.js` porque esta lógica precisa rodar nos dois
 * lados — no navegador, para desenhar as telas, e no servidor
 * (`api/resumo.js`), para montar o resumo que o Esu manda por Telegram.
 * Reimplementar no servidor garantiria divergência: as regras de fatura são
 * cheias de caso descoberto na marra (parcelamento que quita dívida de outro
 * ciclo, duplicata PENDING/POSTED, ciclo de fechamento, crédito maior que o
 * débito) e duas cópias fatalmente andariam separadas.
 *
 * Nada aqui toca DOM, rede ou armazenamento, e nada guarda estado: o estado
 * (`S`, `pluggyTx`) entra por parâmetro. É o que permite o mesmo arquivo
 * servir o navegador e o Node sem build.
 */
var Core = (function () {

  /* ---------- dinheiro e datas ---------- */

  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const money = c => brl.format(c / 100);
  const inMoney = c => (c / 100).toFixed(2).replace(".", ",");
  const pad = n => String(n).padStart(2, "0");
  const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = s => { const p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const todayISO = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  function addMonths(s, n, baseDay) {
    const d = parse(s); const day = baseDay || d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, last)); return iso(t);
  }
  const signed = t => t.tipo === "r" ? t.valor : -t.valor;

  /* ---------- categorias da Pluggy ---------- */

  /* Tabela pequena de propósito, cresce aos poucos com categorias reais
     vistas nos dados. O fallback é "car" (Cartão de crédito), não "out":
     toda linha que passa por aqui já é uma transação de cartão. */
  const PLUGGY_CAT_MAP = {
    "Supermercado": "mer", "Restaurante": "res", "Transporte": "tra",
    "Saúde": "sau", "Farmácia": "sau", "Lazer": "laz", "Assinaturas e serviços": "ass"
  };
  const mapCategory = c => PLUGGY_CAT_MAP[c] || "car";

  function mapPluggyRow(row) {
    return {
      id: "pg-" + row.transaction_id, data: row.date, desc: row.description,
      valor: Math.abs(row.amount_cents), tipo: row.tipo, cat: mapCategory(row.category_pluggy),
      conta: "nubank", ok: row.status === "POSTED", imported: true, fatura: row.fatura || null,
      /* Só o crédito: "Parcelamento de Fatura" também vem como Credit card
         payment, mas é débito — parcela que entra na fatura e tem que somar. */
      pagamento: row.tipo === "r" && (row.category_pluggy === "Credit card payment" || /^pagamento recebido/i.test(row.description || ""))
    };
  }

  /*
   * A Pluggy às vezes emite um `transaction_id` NOVO ao confirmar uma
   * transação, em vez de atualizar a que estava PENDING — o upsert guarda as
   * duas e a compra entraria dobrado na fatura. Quando existe uma confirmada
   * idêntica (mesma data, descrição e valor), a pendente é essa sobra e sai.
   *
   * Compra repetida de verdade não é afetada: seis "Metro Rj" de R$ 7,90 no
   * mesmo dia vêm todas com o MESMO status. Por isso o desconto é contado —
   * para N pendentes e P confirmadas da mesma chave, só P pendentes saem.
   */
  function dedupPendentes(list) {
    const chave = t => t.data + "|" + t.desc + "|" + t.valor, confirmadas = {};
    for (const t of list) if (t.ok) confirmadas[chave(t)] = (confirmadas[chave(t)] || 0) + 1;
    return list.filter(t => {
      if (t.ok) return true;
      const k = chave(t);
      if (confirmadas[k] > 0) { confirmadas[k]--; return false; }
      return true;
    });
  }

  /* ---------- fatura ---------- */

  const FATURA_DIA = 24;    // dia do vencimento da fatura
  const FATURA_FECHA = 17;  // dia do fechamento (padrão Nubank: 7 dias antes do vencimento)
  /*
   * Vencimento da fatura em que uma compra feita em `dataISO` cai: até o dia
   * do fechamento entra na fatura deste mês; depois dele, só na do mês
   * seguinte. É só o fallback: a Pluggy diz o mês da fatura de cada
   * transação (creditCardMetadata.billForecastDate) e é ele que vale quando
   * vem — o dia do fechamento do Nubank varia de mês a mês, e a parcela de
   * compra antiga vem datada do fechamento, não do mês em que é cobrada.
   */
  const vencDe = t => t.fatura ? t.fatura + "-" + pad(FATURA_DIA) : faturaDe(t.data);
  function faturaDe(dataISO) {
    const base = dataISO.slice(0, 8) + pad(FATURA_DIA);
    return Number(dataISO.slice(8, 10)) <= FATURA_FECHA ? base : addMonths(base, 1, FATURA_DIA);
  }
  /* A fatura é paga pela conta corrente. "cc" é o id que o app cria por
     padrão, mas se essa conta tiver sido recriada com outro id o lançamento
     iria parar numa conta inexistente — sumindo da previsão da conta real. */
  const contaFatura = S => S.accounts.some(a => a.id === "cc") ? "cc"
    : (S.accounts.find(a => a.id !== "nubank") || S.accounts[0] || { id: "cc" }).id;

  /*
   * Uma fatura por mês de vencimento, somando as compras daquele ciclo.
   *
   * O agrupamento é por DATA (ou pelo mês que a Pluggy informa), não pelo
   * `billId`: no tier gratuito do Meu Pluggy o produto de faturas não está
   * liberado e nenhuma transação vem com `billId` preenchido. A data vem
   * sempre — inclusive nas parcelas futuras, que a Pluggy devolve com a data
   * do mês em que serão cobradas. É daí que saem as faturas futuras: não são
   * projeção nossa, são as parcelas já contratadas caindo no ciclo delas.
   *
   * O pagamento da fatura ("Pagamento recebido") fica de fora da soma: é o
   * outro lado do próprio lançamento "Fatura Nubank" na conta corrente, e
   * somá-lo contaria o dinheiro duas vezes. Estorno, IOF devolvido e crédito
   * de parcelamento continuam na soma — esses fazem parte da fatura.
   */
  function pluggyBillEntries(S, pluggyTx) {
    const byVenc = {};
    for (const t of pluggyTx) {
      if (t.pagamento) continue;
      const venc = vencDe(t);
      (byVenc[venc] = byVenc[venc] || []).push(t);
    }
    const T = todayISO(), conta = contaFatura(S);
    return Object.keys(byVenc).map(venc => {
      const group = byVenc[venc];
      /* Soma com sinal: compra aumenta a fatura, estorno/crédito abate. */
      const total = -group.reduce((s, t) => s + signed(t), 0);
      /*
       * Fatura nunca é receita: crédito maior que os débitos do ciclo
       * significa que não há nada a pagar, não que entrou dinheiro na conta
       * corrente. Um parcelamento deixa isso evidente — o "Crédito de
       * parcelamento" cai inteiro no ciclo atual, mas quita também dívida
       * que estava em outros ciclos (inclusive de acordo anterior, que some
       * dos dados). O excedente não é saldo a favor: já está contado nas
       * parcelas futuras.
       */
      if (total <= 0) return null;
      return {
        id: "fat-" + venc, data: venc, desc: "Fatura Nubank", valor: total,
        tipo: "d", cat: "car", conta, ok: venc <= T,
        imported: true, isFatura: true, count: group.length
      };
    }).filter(Boolean);
  }

  /* ---------- leitura ---------- */

  /*
   * São três visões sobre os mesmos dados, não uma, porque "todas as compras
   * individuais" e "o que desconta do saldo" não podem ser a mesma lista —
   * contar as compras do cartão E a fatura no vencimento duplicaria a
   * despesa:
   * - everyTx: união crua, pros lugares que precisam do fato real (guarda de
   *   categoria em uso, exportação CSV) mesmo que ele não apareça isolado.
   * - allTx: S.tx + a fatura agregada no lugar das compras — é o que entra
   *   no saldo e no fluxo de caixa.
   * - txs: allTx filtrado, exceto pra conta "nubank", onde mostra as compras
   *   individuais em vez da fatura.
   */
  const everyTx = (S, pluggyTx) => S.tx.concat(pluggyTx);

  /*
   * A Pluggy devolve o histórico inteiro do cartão, inclusive faturas
   * vencidas muito antes de o app começar a ser usado. Essas já saíram da
   * conta corrente antes do saldo inicial — somá-las de novo jogava dezenas
   * de milhares de reais de despesa no saldo.
   */
  const inicioControle = S => S.tx.reduce((m, t) => !m || t.data < m ? t.data : m, "");
  function allTx(S, pluggyTx) {
    const ini = inicioControle(S);
    return S.tx.concat(pluggyBillEntries(S, pluggyTx).filter(f => !ini || f.data >= ini));
  }
  function txs(S, pluggyTx, c) {
    if (c === "nubank") return S.tx.filter(t => t.conta === "nubank").concat(pluggyTx);
    return allTx(S, pluggyTx).filter(t => c === "all" || t.conta === c);
  }

  /* ---------- saldo ---------- */

  const opening = (S, c) => S.accounts.filter(a => c === "all" || a.id === c).reduce((s, a) => s + a.saldoInicial, 0);
  function balanceBefore(S, pluggyTx, d, c, onlyOk) {
    let b = opening(S, c);
    for (const t of txs(S, pluggyTx, c)) if (t.data < d && (!onlyOk || t.ok)) b += signed(t);
    return b;
  }
  function realNow(S, pluggyTx, c) {
    let b = opening(S, c);
    for (const t of txs(S, pluggyTx, c)) if (t.ok) b += signed(t);
    return b;
  }
  function monthSeries(S, pluggyTx, y, m, c) {
    const ym = y + "-" + pad(m + 1), start = ym + "-01", n = new Date(y, m + 1, 0).getDate();
    const list = txs(S, pluggyTx, c).filter(t => t.data.slice(0, 7) === ym), by = {};
    list.forEach(t => (by[t.data] = by[t.data] || []).push(t));
    const openP = balanceBefore(S, pluggyTx, start, c, false);
    let proj = openP, real = balanceBefore(S, pluggyTx, start, c, true);
    const days = [];
    for (let d = 1; d <= n; d++) {
      const key = ym + "-" + pad(d); let ein = 0, eout = 0, rd = 0;
      for (const t of by[key] || []) { if (t.tipo === "r") ein += t.valor; else eout += t.valor; if (t.ok) rd += signed(t); }
      proj += ein - eout; real += rd;
      days.push({ key, d, ein, eout, proj, real, n: (by[key] || []).length });
    }
    return { ym, start, n, days, list, open: openP };
  }

  /* ---------- resumo diário ---------- */

  /*
   * O que o Esu manda por Telegram todo dia.
   *
   * "Quanto posso gastar na semana" é o MENOR saldo previsto entre hoje e o
   * fim do mês, dividido pelas semanas que faltam — e não o saldo do último
   * dia. A diferença importa: com a fatura vencendo no dia 24, o saldo
   * mergulha no meio do mês e volta a subir com o salário. Dividir o saldo
   * final deixaria gastar dinheiro que não existe no dia 24; dividir o menor
   * ponto respeita o vale.
   */
  function resumoDiario(S, pluggyTx, hojeISO) {
    const hoje = hojeISO || todayISO();
    const ontem = addDays(hoje, -1);

    /* Gastos saem de everyTx (fatos crus), não de allTx: interessa a compra
       que foi feita, não o agregado da fatura — que cai no vencimento e não
       no dia em que se gastou. */
    const doDia = everyTx(S, pluggyTx).filter(t => t.data === ontem && t.tipo === "d" && !t.pagamento);
    const gastos = doDia.reduce((s, t) => s + t.valor, 0);
    const itens = doDia.slice().sort((a, b) => b.valor - a.valor)
      .map(t => ({ desc: t.desc, valor: t.valor, cat: t.cat, importado: !!t.imported }));

    const d = parse(hoje), ser = monthSeries(S, pluggyTx, d.getFullYear(), d.getMonth(), "all");
    /* Começa em hoje, não no dia 1: o que já passou não limita o que ainda
       dá para gastar. */
    const deHoje = ser.days.slice(d.getDate() - 1);
    let menor = deHoje[0];
    for (const dia of deHoje) if (dia.proj < menor.proj) menor = dia;

    const diasRestantes = deHoje.length;
    const semanasRestantes = Math.max(1, Math.ceil(diasRestantes / 7));
    /* Saldo negativo dividido por semanas daria um "pode gastar" negativo,
       que não quer dizer nada — nesse caso a resposta é o rombo, não um
       orçamento. */
    const vermelho = menor.proj < 0;

    return {
      hoje, ontem, gastos, itens,
      menorSaldo: menor.proj,
      menorSaldoEm: menor.key,
      saldoFimDoMes: ser.days[ser.n - 1].proj,
      diasRestantes, semanasRestantes,
      porSemana: vermelho ? 0 : Math.floor(menor.proj / semanasRestantes),
      vermelho
    };
  }

  /* Texto pronto para o Telegram. Fica aqui, e não no Esu, para o agente não
     precisar saber formatar dinheiro em pt-BR nem conhecer as regras. */
  function resumoTexto(r) {
    const linhas = [];
    linhas.push(r.gastos > 0
      ? "Ontem você gastou " + money(r.gastos) + "."
      : "Ontem não houve gasto registrado.");

    for (const i of r.itens.slice(0, 3)) linhas.push("• " + i.desc + " — " + money(i.valor));

    if (r.vermelho) {
      linhas.push("Atenção: o saldo fica negativo em " + r.menorSaldoEm.slice(8, 10) + "/" +
        r.menorSaldoEm.slice(5, 7) + " (" + money(r.menorSaldo) + ").");
    } else {
      linhas.push("Dá para gastar " + money(r.porSemana) + " por semana até o fim do mês.");
      linhas.push("Menor saldo previsto: " + money(r.menorSaldo) + " em " +
        r.menorSaldoEm.slice(8, 10) + "/" + r.menorSaldoEm.slice(5, 7) + ".");
    }
    return linhas.join("\n");
  }

  return {
    money, inMoney, pad, iso, parse, todayISO, addDays, addMonths, signed,
    PLUGGY_CAT_MAP, mapCategory, mapPluggyRow, dedupPendentes,
    FATURA_DIA, FATURA_FECHA, faturaDe, vencDe, contaFatura, pluggyBillEntries,
    everyTx, inicioControle, allTx, txs,
    opening, balanceBefore, realNow, monthSeries,
    resumoDiario, resumoTexto
  };
})();

/* No navegador o `var Core` acima já basta; no Node, exporta. */
if (typeof module !== "undefined" && module.exports) module.exports = Core;

"use strict";
/*
 * Leitura do estado para as funções de servidor: o blob do `app_state` mais
 * as linhas do cartão, já mapeadas e sem as pendentes duplicadas.
 *
 * Vive aqui, e não dentro de um endpoint, porque `/api/resumo` e
 * `/api/briefing` precisam exatamente do mesmo preparo. O que não pode ser
 * duplicado é a paginação: é o detalhe que, errado, some com transações em
 * silêncio — a conta continua fechando, só que com menos dados.
 */
const Core = require("../core.js");

/* Mesmas colunas que o navegador pede em app.js: `raw` fica de fora (é o
   payload inteiro da Pluggy) e dele só interessa o mês da fatura. */
const COLS = "transaction_id,date,description,amount_cents,tipo,status,category_pluggy,"
  + "fatura:raw->creditCardMetadata->>billForecastDate,"
  + "parcela:raw->creditCardMetadata->>installmentNumber,"
  + "total:raw->creditCardMetadata->>totalInstallments";

/* O PostgREST corta em 1000 linhas por requisição e o histórico passa disso;
   sem paginar, o resto sumiria da conta sem erro nenhum. */
async function lePluggyTx(supabase, uid) {
  let linhas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("pluggy_tx").select(COLS)
      .eq("user_id", uid).order("transaction_id").range(de, de + 999);
    if (error) throw error;
    linhas = linhas.concat(data || []);
    if (!data || data.length < 1000) return linhas;
  }
}

/*
 * Devolve `{ S, pluggyTx }` pronto para o `core.js`, ou `null` quando não há
 * estado gravado. `null` e não um estado vazio: sem saldo inicial nem
 * lançamento manual, qualquer conta seria inventada, e é melhor o chamador
 * dizer que não há o que resumir do que publicar um número sem lastro.
 */
async function leEstado(supabase, uid) {
  const { data: linha, error } = await supabase.from("app_state")
    .select("data").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  if (!linha || !linha.data) return null;
  return {
    S: linha.data,
    pluggyTx: Core.dedupPendentes((await lePluggyTx(supabase, uid)).map(Core.mapPluggyRow))
  };
}

module.exports = { COLS, lePluggyTx, leEstado };

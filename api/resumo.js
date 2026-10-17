"use strict";
/*
 * Resumo diário para o Esu mandar no Telegram: quanto foi gasto ontem e
 * quanto ainda dá para gastar por semana.
 *
 * A conta não é feita aqui — vem de `core.js`, o mesmo arquivo que o
 * navegador usa para desenhar as telas. É o que garante que o número da
 * mensagem é o MESMO que aparece no app: as regras de fatura (parcelamento,
 * duplicata PENDING/POSTED, ciclo de fechamento) são cheias de caso
 * particular, e uma segunda implementação divergiria em silêncio.
 *
 * Uso: GET /api/resumo?key=SEU_AJE_RESUMO_SECRET
 */
const { createClient } = require("@supabase/supabase-js");
const Core = require("../core.js");

/* Mesmas colunas que o navegador pede em app.js: `raw` fica de fora (é o
   payload inteiro da Pluggy) e dele só interessa o mês da fatura. */
const COLS = "transaction_id,date,description,amount_cents,tipo,status,category_pluggy,"
  + "fatura:raw->creditCardMetadata->>billForecastDate";

/* O PostgREST corta em 1000 linhas por requisição e o histórico passa disso;
   sem paginar, o resto sumiria da conta em silêncio. */
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

module.exports = async (req, res) => {
  const key = (req.query || {}).key;
  if (!key || key !== process.env.AJE_RESUMO_SECRET) {
    return res.status(403).send("Chave inválida");
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const uid = process.env.AJE_USER_ID;

    const { data: linha, error } = await supabase.from("app_state")
      .select("data").eq("user_id", uid).maybeSingle();
    if (error) throw error;
    /* Sem estado não há saldo inicial nem lançamento manual: qualquer conta
       aqui seria inventada. Melhor dizer que não há o que resumir. */
    if (!linha || !linha.data) return res.status(200).json({ vazio: true, texto: "" });

    const S = linha.data;
    const pluggyTx = Core.dedupPendentes((await lePluggyTx(supabase, uid)).map(Core.mapPluggyRow));

    const r = Core.resumoDiario(S, pluggyTx);
    /* O texto vai pronto para o Telegram: assim o Esu não precisa saber
       formatar dinheiro em pt-BR nem conhecer as regras de fatura. */
    return res.status(200).json(Object.assign({ texto: Core.resumoTexto(r) }, r));
  } catch (e) {
    console.error(e);
    return res.status(500).send(String(e.message || e));
  }
};

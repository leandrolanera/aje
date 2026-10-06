"use strict";
/*
 * Endpoint público que a Pluggy chama (item/updated, transactions/created,
 * transactions/updated — cadastrados via API, não pelo painel, ver
 * PLUGGY.md). Verificado pelo header `x-webhook-secret`, que a própria
 * Pluggy devolve em toda chamada porque pedimos pra ela guardar esse header
 * no momento de criar o webhook (POST /webhooks com `headers`). É segredo
 * compartilhado, não HMAC, mas já é bem mais forte que confiar só no IP de
 * origem.
 *
 * Mesmo assim, o corpo do webhook NUNCA é tratado como fonte de dado — só
 * como gatilho pra ir buscar o estado atual direto na API da Pluggy com
 * nossas próprias credenciais. Isso fecha o único jeito de alguém injetar
 * transação falsa mesmo que descubra o segredo.
 */
const { createClient } = require("@supabase/supabase-js");
const { syncItem } = require("./lib/pluggy");

exports.handler = async event => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const secret = event.headers["x-webhook-secret"];
  if (!secret || secret !== process.env.PLUGGY_WEBHOOK_SECRET) {
    return { statusCode: 403, body: "Segredo inválido" };
  }

  let payload = {};
  try { payload = JSON.parse(event.body || "{}") } catch (e) { /* segue mesmo sem corpo válido — é só gatilho */ }

  const relevant = ["item/updated", "transactions/created", "transactions/updated"];
  if (payload.event && !relevant.includes(payload.event)) {
    return { statusCode: 200, body: "ignorado: " + payload.event };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const result = await syncItem(supabase);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: String(e.message || e) };
  }
};

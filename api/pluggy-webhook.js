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
const { syncItem } = require("./_pluggy.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const secret = req.headers["x-webhook-secret"];
  if (!secret || secret !== process.env.PLUGGY_WEBHOOK_SECRET) {
    return res.status(403).send("Segredo inválido");
  }

  /* No Vercel `req.body` já vem parseado quando o Content-Type é JSON, mas é
     um getter que lança se o corpo vier malformado — daí o try/catch. Corpo
     inválido não impede o sync: o payload é só gatilho, nunca fonte de dado. */
  let payload = {};
  try { payload = req.body || {} } catch (e) { /* segue mesmo sem corpo válido */ }

  const relevant = ["item/updated", "transactions/created", "transactions/updated"];
  if (payload.event && !relevant.includes(payload.event)) {
    return res.status(200).send("ignorado: " + payload.event);
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const result = await syncItem(supabase);
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).send(String(e.message || e));
  }
};

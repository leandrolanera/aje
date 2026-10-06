"use strict";
/*
 * Disparo manual (GET) pro backfill inicial e pra forçar um resync se algum
 * webhook falhar — mesma lógica compartilhada do pluggy-webhook.js. Protegido
 * por uma chave em query string, já que é alcançável por quem souber a URL.
 *
 * Uso: GET /.netlify/functions/pluggy-sync?key=SEU_PLUGGY_SYNC_SECRET
 */
const { createClient } = require("@supabase/supabase-js");
const { syncItem } = require("./lib/pluggy");

exports.handler = async event => {
  const key = (event.queryStringParameters || {}).key;
  if (!key || key !== process.env.PLUGGY_SYNC_SECRET) {
    return { statusCode: 403, body: "Chave inválida" };
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

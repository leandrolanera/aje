"use strict";
/*
 * Disparo manual (GET) pro backfill inicial e pra forçar um resync se algum
 * webhook falhar — mesma lógica compartilhada do pluggy-webhook.js. Protegido
 * por uma chave em query string, já que é alcançável por quem souber a URL.
 *
 * Uso: GET /api/pluggy-sync?key=SEU_PLUGGY_SYNC_SECRET
 */
const { createClient } = require("@supabase/supabase-js");
const { syncItem } = require("./_pluggy.js");

module.exports = async (req, res) => {
  const key = (req.query || {}).key;
  if (!key || key !== process.env.PLUGGY_SYNC_SECRET) {
    return res.status(403).send("Chave inválida");
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

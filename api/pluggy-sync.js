"use strict";
/*
 * Disparo manual do sync: pro backfill inicial, pra forçar um resync quando
 * um webhook falha, e pelo botão "Sincronizar agora" na tela de Contas.
 * Mesma lógica compartilhada do pluggy-webhook.js.
 *
 * Duas formas de autenticar, porque são dois chamadores diferentes:
 *
 * 1. `?key=` com o PLUGGY_SYNC_SECRET — para curl e scripts.
 * 2. `Authorization: Bearer <token>` com a sessão do Supabase — para o
 *    botão no app.
 *
 * A segunda existe porque o navegador NÃO pode carregar o segredo: `config.js`
 * é servido publicamente, e qualquer um que lesse o arquivo poderia disparar
 * syncs. A sessão o usuário já tem, ela expira sozinha e é verificada contra
 * o Supabase a cada chamada.
 *
 * Uso: GET /api/pluggy-sync?key=SEGREDO
 *      GET /api/pluggy-sync        (com header Authorization)
 */
const { createClient } = require("@supabase/supabase-js");
const { syncItem } = require("./_pluggy.js");

/* Valida o token contra o Supabase e confere se é o dono deste AJÉ. O app é
   de uso pessoal: uma sessão válida de OUTRA conta não serve. */
async function sessaoValida(req) {
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;

  /* Com a anon key, não a service role: aqui queremos justamente a
     verificação normal de sessão, não um atalho que ignora tudo. */
  const publico = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data, error } = await publico.auth.getUser(token);
  if (error || !data || !data.user) return false;
  return data.user.id === process.env.AJE_USER_ID;
}

module.exports = async (req, res) => {
  const key = (req.query || {}).key;
  const porChave = key && key === process.env.PLUGGY_SYNC_SECRET;

  try {
    if (!porChave && !(await sessaoValida(req))) {
      return res.status(403).send("Não autorizado");
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const result = await syncItem(supabase);
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).send(String(e.message || e));
  }
};

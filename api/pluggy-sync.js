"use strict";
/*
 * Disparo manual do sync: pro backfill inicial, pra forçar um resync quando
 * um webhook falha, e pelo botão "Sincronizar agora" na tela de Contas.
 * Mesma lógica compartilhada do pluggy-webhook.js.
 *
 * Três formas de autenticar, porque são três chamadores diferentes:
 *
 * 1. `?key=` com o PLUGGY_SYNC_SECRET — para curl e scripts.
 * 2. `Authorization: Bearer <token>` com a sessão do Supabase — para o
 *    botão no app.
 * 3. `Authorization: Bearer <CRON_SECRET>` — para o cron do Vercel.
 *
 * A segunda existe porque o navegador NÃO pode carregar o segredo: `config.js`
 * é servido publicamente, e qualquer um que lesse o arquivo poderia disparar
 * syncs. A sessão o usuário já tem, ela expira sozinha e é verificada contra
 * o Supabase a cada chamada.
 *
 * A terceira existe porque o webhook da Pluggy parou de chegar e as compras
 * ficaram dois dias sem entrar. O agendamento não substitui o webhook — ele
 * garante um piso de duas atualizações por dia mesmo quando o webhook
 * silencia, que é a falha pior: sem erro nenhum, só dado velho.
 *
 * Uso: GET /api/pluggy-sync?key=SEGREDO
 *      GET /api/pluggy-sync        (com header Authorization)
 */
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { syncItem } = require("./_pluggy.js");

/* Definido o CRON_SECRET, o Vercel o envia em `Authorization` a cada
   invocação. Conferido ANTES da sessão do Supabase, que custa uma ida à
   rede — e em tempo constante, como nos outros endpoints. */
function ehCron(req) {
  const auth = (req.headers || {}).authorization || "";
  const chave = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const esperada = process.env.CRON_SECRET || "";
  if (!chave || !esperada) return false;
  const a = Buffer.from(chave), b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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
    if (!porChave && !ehCron(req) && !(await sessaoValida(req))) {
      return res.status(403).send("Não autorizado");
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const result = await syncItem(supabase);
    /* No log porque a falha silenciosa aqui é `transactions: 0`: a chamada
       deu 200, mas a conexão da Pluggy caiu e nada veio. Sem o número no
       log, isso é indistinguível de um dia sem compras. */
    console.log("pluggy-sync:", JSON.stringify(result));
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).send(String(e.message || e));
  }
};

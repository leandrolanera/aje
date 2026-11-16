"use strict";
/*
 * O resumo do dia, no Telegram, disparado pelo cron do Vercel.
 *
 * Substitui o briefing que rodava no Esu (Fly.io), desligado para cortar
 * custo recorrente. A diferença que viabiliza a troca: aqui **não há chamada
 * de modelo**. É aritmética e formatação, feitas pelo mesmo `core.js` que
 * desenha as telas — então os números do Telegram são os mesmos do app, por
 * construção. Vercel Hobby e API do Telegram são gratuitos: custo zero.
 *
 * Chegar sozinho é o ponto. O contador semanal só serve se aparecer antes da
 * decisão de gastar; se depender de alguém lembrar de abrir o app, ele vira
 * relatório do estrago em vez de freio.
 *
 * Separado do `/api/keepalive` de propósito: lá o trabalho é falhar alto
 * sobre o banco, e uma falha do Telegram misturada ali pareceria o Supabase
 * fora do ar. Dois alarmes distintos, dois endpoints.
 *
 * Agendado em vercel.json. Variáveis necessárias: CRON_SECRET,
 * TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (além das do Supabase).
 */
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const Core = require("../core.js");
const { leEstado } = require("./_estado.js");

/* Mesmo guarda do keepalive: definido o CRON_SECRET, o Vercel o envia em
   `Authorization` a cada invocação. Comparação em tempo constante, e segredo
   ausente recusa até chave vazia — esquecer a variável não pode abrir o
   endpoint. */
function autorizado(req) {
  const auth = (req.headers || {}).authorization || "";
  const chave = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const esperada = process.env.CRON_SECRET || "";
  if (!chave || !esperada) return false;
  const a = Buffer.from(chave), b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/*
 * A função roda em UTC, mas o "ontem" do resumo é o de quem lê. Sem isto uma
 * execução às 00h30 UTC — 21h30 em Brasília — chamaria de "ontem" o dia que
 * para ele ainda está em curso. `en-CA` formata como AAAA-MM-DD, que é o
 * formato de data que o core.js usa.
 */
const hojeEmBrasilia = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());

async function mandaTelegram(texto) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) throw new Error("TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurado");
  const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: texto })
  });
  /* O corpo do erro do Telegram diz o motivo (chat_id errado, bot bloqueado,
     token inválido) e é o que transforma um 500 mudo em diagnóstico. */
  if (!r.ok) throw new Error("Telegram respondeu " + r.status + ": " + (await r.text()).slice(0, 200));
}

module.exports = async (req, res) => {
  if (!autorizado(req)) return res.status(401).send("Não autorizado");

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const estado = await leEstado(supabase, process.env.AJE_USER_ID);
    /* Sem estado gravado não há o que resumir, e mandar mensagem vazia seria
       ruído diário. Devolve 200: não é erro, é não ter assunto. */
    if (!estado) return res.status(200).json({ vazio: true, enviado: false });

    const hoje = hojeEmBrasilia();
    const r = Core.resumoDiario(estado.S, estado.pluggyTx, hoje);
    const texto = "AJÉ — " + hoje.slice(8, 10) + "/" + hoje.slice(5, 7)
      + "\n\n" + Core.resumoTexto(r);
    await mandaTelegram(texto);

    return res.status(200).json({ enviado: true, hoje, caracteres: texto.length });
  } catch (e) {
    /* O Vercel não repete invocação de cron, então o 500 no log é o único
       aviso de que a mensagem de hoje não saiu. Engolir o erro faria o
       briefing sumir sem ninguém notar — que é exatamente como o do Esu
       deixaria de chegar se não houvesse alarme. */
    console.error("briefing falhou:", e);
    return res.status(500).send(String((e && e.message) || e));
  }
};

"use strict";
/*
 * Mantém o projeto do Supabase acordado.
 *
 * O plano gratuito pausa projetos com pouca atividade numa janela de 7 dias,
 * e pausado significa app sem login, sem sincronização do Nubank e briefing
 * do Esu cego. Algumas consultas ao banco por dia bastam para evitar a pausa
 * (ver "Project Pausing" na documentação do Supabase).
 *
 * O briefing diário do Esu já consultava o banco todo dia — e o projeto
 * pausou mesmo assim. Por isso este endpoint existe: ele roda no Vercel, ao
 * lado das credenciais do banco, e não depende de a Fly, o Telegram ou o
 * agendador do Esu estarem de pé. Disponibilidade do app não pode depender
 * da saúde de outro sistema.
 *
 * Não basta responder 200: a atividade que conta é consulta ao BANCO. Uma
 * página estática no Vercel não toca no Supabase, e um endpoint que só
 * devolvesse "ok" deixaria o cron verde enquanto o projeto pausava.
 *
 * Agendado em vercel.json. O `CRON_SECRET` é mecanismo nativo do Vercel:
 * definido nas variáveis do projeto, ele vai automaticamente no cabeçalho
 * `Authorization` de cada invocação.
 */
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

/* Comparação em tempo constante, como em api/resumo.js: `!==` sai no
   primeiro caractere diferente, e o tempo de resposta contaria quanto do
   segredo já acertou. */
function autorizado(req) {
  const auth = (req.headers || {}).authorization || "";
  const chave = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const esperada = process.env.CRON_SECRET || "";
  /* Segredo não configurado recusa até chave vazia: sem isso, esquecer a
     variável abriria o endpoint para qualquer um. */
  if (!chave || !esperada) return false;
  const a = Buffer.from(chave), b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (!autorizado(req)) return res.status(401).send("Não autorizado");

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    /* A menor consulta real que ainda é consulta: uma coluna, uma linha. */
    const { error } = await supabase.from("app_state").select("user_id").limit(1);
    if (error) throw error;
    return res.status(200).json({ ok: true, em: new Date().toISOString() });
  } catch (e) {
    /* Falhar alto é o ponto: o Vercel não repete invocação de cron, então um
       500 no log é o único aviso de que o banco parou de responder — e que a
       pausa voltou a correr. Engolir o erro devolvendo 200 tornaria este
       endpoint um alarme que nunca toca. */
    console.error("keepalive falhou:", e);
    return res.status(500).send(String((e && e.message) || e));
  }
};

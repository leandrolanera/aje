# AJÉ

Controle financeiro pessoal: lançamentos realizados e previstos, recorrência, parcelas e saldo esperado dia a dia.

## Rodar

Abra `index.html` no navegador, ou sirva a pasta:

    python3 -m http.server 8000

Os dados ficam no `localStorage` do navegador. Na versão publicada no
claude.ai eles ficam na sua conta (capacidade `db`); com um projeto Supabase
configurado (opcional, ver [SUPABASE.md](SUPABASE.md)) eles sincronizam entre
dispositivos por conta própria. O código detecta e usa cada modo sozinho,
nessa ordem: claude.ai → Supabase → só local. Com o Supabase configurado, dá
pra também sincronizar a fatura do Nubank automaticamente (opcional, ver
[PLUGGY.md](PLUGGY.md)).

## Publicar

O app é estático (sem build) e está publicado no **Vercel**, que também roda
as funções de servidor em `api/`. O `vercel.json` cobre a configuração.
Passo a passo e a sincronização entre dispositivos estão em
[SUPABASE.md](SUPABASE.md).

## Resumo diário no Telegram

Todo dia de manhã chega uma mensagem com o gasto de ontem, quanto resta do
teto semanal e o menor saldo previsto:

```
AJÉ — 17/11

Ontem você gastou R$ 685,16.
• Condomínio — R$ 600,00
• Almoço — R$ 85,16
Semana: R$ 85,16 de R$ 635,00 — restam R$ 549,84.
Atenção: o saldo fica negativo em 24/11 (-R$ 472,32).
```

Quem monta é [`api/briefing.js`](api/briefing.js), agendado no `vercel.json`.
A conta vem do `core.js` — o mesmo arquivo que desenha as telas —, então o
número da mensagem é o mesmo do app por construção, não por coincidência.

**Não há chamada de modelo**: é aritmética e formatação. Vercel Hobby e a API
do Telegram são gratuitos, então o custo recorrente é zero. (Antes isso rodava
num agente no Fly.io, que gastava tokens e hospedagem.)

Para ligar, três variáveis no projeto do Vercel, além das do Supabase:

| Variável | O que é |
|---|---|
| `CRON_SECRET` | string aleatória; o Vercel a envia em `Authorization` |
| `TELEGRAM_BOT_TOKEN` | token do bot, do @BotFather |
| `TELEGRAM_CHAT_ID` | o chat que recebe |

**Depois de criar ou editar qualquer uma delas, faça um redeploy.** O Vercel
captura as variáveis no momento do build e a função roda com aquela cópia
congelada — variável criada depois do último deployment existe no painel e
não existe para o código. Foi exatamente assim que o primeiro briefing
falhou: o token entrou antes do build, o chat id depois.

O endpoint recusa tudo enquanto `CRON_SECRET` não existir, e falha com 500 —
nunca em silêncio — se faltar token, chat ou banco. O Vercel não repete
invocação de cron, então esse 500 no log é o único aviso de que a mensagem do
dia não saiu.

### Testar e diagnosticar

```bash
vercel link                          # uma vez por máquina
vercel crons run /api/briefing       # dispara na hora
vercel logs --deployment <url-prod>  # o motivo, quando falha
```

O `vercel crons run` dispara **como se fosse o cron**: o próprio Vercel envia
a cópia do `CRON_SECRET` no cabeçalho. Não é preciso conhecer o segredo — o
que é bom, porque gravado como *Secret* ele não pode mais ser lido.

`vercel env ls` mostra em quais ambientes cada variável existe e **quando foi
criada**. Comparar essa data com a idade do deployment é o diagnóstico mais
rápido para "configurei e não funcionou".

**O teto semanal** vem de `tetoSemanal` no estado (em centavos), não do
código: ele muda conforme a dívida encolhe. Sem ele, o contador informa o
gasto e não compara.

## Arquivos

- `index.html`: estrutura da página
- `styles.css`: tokens de cor, tipografia e componentes
- `app.js`: estado, cálculos de saldo, telas, gráfico e gravação/sincronização
- `config.js`: credenciais do Supabase (vazio por padrão — ver SUPABASE.md)
- `fonts/`: Oswald e Figtree auto-hospedadas, subsets `latin` e `latin-ext`
- `IDENTIDADE-VISUAL.md`: a paleta, os contrastes medidos e o porquê de cada
  decisão visual. Leia antes de mexer em cor ou tipografia — as regras ali
  custaram medição, não gosto.
- `SUPABASE.md`: como ligar a sincronização entre dispositivos e publicar o
  site.
- `PLUGGY.md`: como ligar a sincronização automática da fatura do Nubank
  (opcional, precisa do Supabase já configurado).
- `api/`: as únicas partes do projeto que rodam num servidor (não no
  navegador) — buscam a fatura na API da Pluggy e gravam no Supabase. O
  `_pluggy.js` é o módulo compartilhado: o prefixo `_` é o que impede o
  Vercel de transformá-lo numa rota. `package.json` na raiz é só a
  dependência delas (`@supabase/supabase-js`); o site em si continua sem
  build.



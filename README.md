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
- `netlify/`, `netlify.toml`: hospedagem anterior, mantida por ora como
  alternativa. Fica fora do deploy pelo `.vercelignore` — se fosse junto, o
  Vercel serviria esse código como arquivo estático.



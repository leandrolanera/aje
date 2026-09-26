# Saldo Diário

Controle financeiro pessoal: lançamentos realizados e previstos, recorrência, parcelas e saldo esperado dia a dia.

## Rodar

Abra `index.html` no navegador, ou sirva a pasta:

    python3 -m http.server 8000

Os dados ficam no `localStorage` do navegador. Na versão publicada no
claude.ai eles ficam na sua conta (capacidade `db`); com um projeto Supabase
configurado (opcional, ver [SUPABASE.md](SUPABASE.md)) eles sincronizam entre
dispositivos por conta própria. O código detecta e usa cada modo sozinho,
nessa ordem: claude.ai → Supabase → só local.

## Publicar

O app é estático (sem build). Suba a pasta para GitHub Pages, Netlify ou
Vercel e está no ar — os arquivos `netlify.toml`/`vercel.json` já cobrem os
dois primeiros. Passo a passo e a sincronização entre dispositivos estão em
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

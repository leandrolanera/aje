# Sincronizar entre dispositivos

Sem isto, o app funciona só com `localStorage`: cada navegador tem seu
próprio histórico, sem sincronizar. Com um projeto Supabase (grátis),
qualquer dispositivo em que você entrar com o mesmo e-mail vê os mesmos
lançamentos, em tempo real.

## 1. Criar o projeto

Em [supabase.com](https://supabase.com), crie uma conta e um projeto novo
(plano free). Guarde a região perto de você — só afeta latência.

## 2. Criar a tabela

Em **SQL Editor**, rode:

```sql
create table public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

create policy "cada um só vê e grava a própria linha"
  on public.app_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.app_state;
```

A linha inteira do app (contas, categorias, lançamentos) fica num único
campo `jsonb` — o mesmo formato que já ia para o `localStorage`. A RLS
garante que ninguém lê ou escreve a linha de outra pessoa, mesmo a
`anon key` sendo pública.

## 3. Configurar o link de acesso por e-mail

Em **Authentication → Providers → Email**, deixe "Confirm email" como
preferir (não é obrigatório para o link mágico funcionar). Em
**Authentication → URL Configuration**, adicione em **Redirect URLs** a
URL onde o app vai ficar publicado (ex.: `https://aje-financeiro.netlify.app`
ou `http://localhost:8321` para testar local). Sem isso, o Supabase rejeita
o redirecionamento do link e a pessoa não consegue entrar.

## 4. Preencher as credenciais no app

Em **Project Settings → API**, copie **Project URL** e a chave **anon
public** (não a `service_role`, essa nunca deve ir para o navegador).
Edite [config.js](config.js):

```js
window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJ...";
```

Com isso preenchido, a tela **Contas** passa a mostrar "Sincronizar entre
dispositivos". Sem preencher, essa seção some e o app segue só local — nada
muda para quem não configurar.

## Como funciona

- `app.js` cria o cliente Supabase só se `config.js` tiver as duas chaves
  (`const supa = ...`, perto de `initStore`).
- Entrar manda um "magic link" por e-mail (`supa.auth.signInWithOtp`), sem
  senha. Ao abrir o link no mesmo navegador, a sessão é criada e o app
  reconecta sozinho (`setupAuth`/`onAuthStateChange` em `app.js`).
- A gravação (`persist()`) já escrevia sempre no `localStorage` e, se havia
  um `ref` (antes só o `db` do claude.ai, agora também o Supabase), gravava
  lá também — essa parte não mudou.
- A leitura em tempo real usa Postgres Realtime
  (`supa.channel(...).on("postgres_changes", ...)`), equivalente ao
  `onSnapshot` que o `db` do claude.ai já expõe — por isso a reconciliação
  por `rev` (`attachRef` em `app.js`) serve para as duas fontes sem
  duplicar código.
- Sair (`Sair desta conta`) desconecta o canal em tempo real e volta para o
  `localStorage` deste dispositivo; os lançamentos não são apagados.

## Publicar (hospedagem estática)

O app é HTML/CSS/JS puro, sem build. Qualquer hospedagem estática serve:
GitHub Pages, Netlify, Vercel, Cloudflare Pages. Suba a pasta inteira
(`index.html`, `styles.css`, `app.js`, `config.js`, `fonts/`) — não precisa
de servidor próprio, nem do Supabase para o *site* funcionar (só para a
sincronização). Lembre de repetir o passo 3 com a URL final publicada.

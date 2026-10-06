# Sincronizar a fatura do Nubank

Sem isto, todo lançamento é manual. Com o Pluggy (agregador via Open
Finance, regulado pelo Banco Central — não é engenharia reversa da API
privada do Nubank) e o tier gratuito de uso pessoal ("Meu Pluggy"), a fatura
do cartão sincroniza sozinha **uma vez por dia**. Não é a cada compra: tempo
real de verdade só existe no plano pago do Pluggy (a partir de R$2.500/mês),
desproporcional pra um app pessoal. Sincronização diária já tira o trabalho
de lançar na mão.

Importante: você conecta o Nubank no **próprio portal do Pluggy**
(`meu.pluggy.ai`), fora deste app — o AJÉ não pede login de banco nenhum.

## 1. Conectar o Nubank no Meu Pluggy

Em [meu.pluggy.ai](https://meu.pluggy.ai), crie uma conta gratuita (seu
"Passaporte de Dados") e conecte seu Nubank lá. É de graça por tempo
indeterminado pra uso pessoal, até 5 conexões.

## 2. Criar a aplicação e pegar as credenciais

No [Dashboard do Pluggy](https://dashboard.pluggy.ai), cadastre sua conta
(de preferência com o mesmo e-mail do Meu Pluggy) e crie uma aplicação — uma
só basta. Abra a aba **"Aplicação"**: as credenciais (`CLIENT_ID` e
`CLIENT_SECRET`) estão ali.

**Não selecione "Nubank" na lista de conectores.** Tentar conectar um banco
real diretamente pela aplicação é o fluxo comercial (pago, com aviso de
teste de 15 dias) — é exatamente isso que gera o erro "Contas de teste só
podem conectar conectores sandbox". O que você quer é diferente: existe um
conector chamado **"MeuPluggy"**, que é um proxy gratuito e lê os dados que
você já conectou no `meu.pluggy.ai` (passo 1) — é esse que não tem limite de
tempo nem precisa de aprovação. Confirmado direto na documentação oficial:
"o aviso de teste de 15 dias é da parte comercial do Dashboard e não limita
o uso pessoal" — pra uso pessoal via conector MeuPluggy, "não precisa virar
para produção, pedir aprovação nem falar com ninguém do time". Guarde o
`itemId` que aparecer ao usar esse conector.

## 3. Criar a tabela no Supabase

Em **SQL Editor** (mesmo projeto Supabase do [SUPABASE.md](SUPABASE.md)),
rode:

```sql
create table public.pluggy_tx (
  transaction_id     uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  item_id            uuid not null,
  account_id         uuid not null,
  bill_id            uuid,
  date               date not null,
  description        text not null,
  amount_cents       bigint not null,
  tipo               text not null check (tipo in ('r','d')),
  status             text not null check (status in ('PENDING','POSTED')),
  category_pluggy    text,
  installment_number int,
  installment_total  int,
  raw                jsonb not null,
  updated_at         timestamptz not null default now()
);

alter table public.pluggy_tx enable row level security;

create policy "cada um só lê a própria linha"
  on public.pluggy_tx for select
  using (auth.uid() = user_id);

-- sem policy de insert/update/delete pro client: só a service_role grava
-- aqui, a partir das Netlify Functions — o navegador só lê.

alter publication supabase_realtime add table public.pluggy_tx;
```

É uma tabela separada do `app_state` de propósito — ver "Como funciona"
abaixo.

## 4. Configurar as variáveis de ambiente no Netlify

Em **Site configuration → Environment variables**, crie:

```
PLUGGY_CLIENT_ID
PLUGGY_CLIENT_SECRET
PLUGGY_ITEM_ID
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
AJE_USER_ID
PLUGGY_SYNC_SECRET
PLUGGY_WEBHOOK_SECRET
```

`SUPABASE_URL` é a mesma URL do projeto que já está em `config.js`, só que
como variável de ambiente (não no arquivo). `SUPABASE_SERVICE_ROLE_KEY` está
em **Project Settings → API** no Supabase, ao lado da `anon key` — **essa
chave nunca pode ir pro `config.js` nem pro repositório**, ela ignora toda a
Row Level Security. `AJE_USER_ID` é o seu próprio `auth.users.id` (visível
em **Authentication → Users** no Supabase). `PLUGGY_SYNC_SECRET` é uma senha
qualquer que você inventa, só pra proteger o endpoint de resync manual.
`PLUGGY_WEBHOOK_SECRET` é outra senha qualquer, inventada por você — é o
segredo que a Pluggy vai devolver em todo webhook (passo 6), pra provar que
a chamada é dela mesma.

## 5. Rodar o backfill inicial

O webhook (próximo passo) só avisa de mudanças daqui pra frente — pra trazer
a fatura atual, rode uma vez:

```
curl "https://SEU-SITE.netlify.app/.netlify/functions/pluggy-sync?key=SEU_PLUGGY_SYNC_SECRET"
```

Seguro de rodar de novo quando quiser forçar um resync — é idempotente.

## 6. Cadastrar o webhook (via API, não tem formulário no painel)

Primeiro pegue uma API Key (válida por 2h):
```
curl -X POST https://api.pluggy.ai/auth \
  -H "Content-Type: application/json" \
  -d '{"clientId":"SEU_PLUGGY_CLIENT_ID","clientSecret":"SEU_PLUGGY_CLIENT_SECRET"}'
```
Com o `apiKey` da resposta, cadastre o webhook já com o segredo no header
(é esse header que `pluggy-webhook.js` confere em toda chamada):
```
curl -X POST https://api.pluggy.ai/webhooks \
  -H "X-API-KEY: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://SEU-SITE.netlify.app/.netlify/functions/pluggy-webhook",
    "event": "all",
    "headers": {"x-webhook-secret": "SEU_PLUGGY_WEBHOOK_SECRET"}
  }'
```
`"event":"all"` cadastra pra todos os eventos — a função já ignora (responde
200 sem processar) qualquer evento que não seja `item/updated`,
`transactions/created` ou `transactions/updated`, então não precisa
granularizar aqui.

## Como funciona

- As transações importadas vivem na tabela `pluggy_tx`, **separada** do
  `app_state` que já existe. `flush()` em `app.js` sobrescreve a linha
  inteira do `app_state` por `rev` — se a Netlify Function escrevesse ali ao
  mesmo tempo que uma edição manual estivesse pendente, um dos dois lados
  perderia a escrita silenciosamente. Com tabela própria, os dois
  escritores nunca tocam a mesma linha.
- No navegador, essas linhas entram numa variável `pluggyTx` separada de
  `S` (não `S.pluggyTx`) — de propósito, pra nunca serem serializadas por
  `persist()`/`clone(S)` e vazarem pro `app_state` sem querer. `allTx()` em
  `app.js` junta `S.tx` com `pluggyTx` só na hora de ler; nada disso é
  gravado de volta.
- O webhook é verificado pelo header `x-webhook-secret` (segredo
  compartilhado que a própria Pluggy devolve, configurado no passo 6 — não
  é assinatura HMAC, mas já prova que a chamada veio de quem conhece o
  segredo). Mesmo assim, o corpo do webhook nunca é fonte de dado, só
  gatilho: ao receber a chamada, a função busca o estado atual direto na
  API da Pluggy com as credenciais guardadas, nunca confia em transação que
  viesse dentro do corpo do webhook.
- Transações importadas são **só leitura** no app: sem botão de marcar
  realizado, sem edição. Editar criaria uma segunda versão do mesmo
  lançamento bancário, e o próximo sync reverteria a edição sem avisar.
- A conta "Nubank" é criada sozinha (`app.js`, dentro de `attachPluggy`) na
  primeira sincronização que trouxer alguma transação — com id fixo, pra não
  duplicar em recarregamentos.
- Categoria vem de um mapa pequeno (`PLUGGY_CAT_MAP` em `app.js`) das
  categorias da Pluggy pras categorias já existentes no AJÉ, com fallback
  pra "Cartão de crédito" quando não reconhece — cresce aos poucos conforme
  aparecem categorias novas nos dados reais.

## Limitações conhecidas

- **Sincronização é diária**, não por compra — ver o aviso no topo deste
  arquivo.
- **Convenção de sinal do valor** (`amount_cents`/`tipo` em
  `netlify/functions/lib/pluggy.js`) foi implementada com a convenção mais
  comum entre agregadores, mas não testada contra um extrato real até a
  primeira sincronização de alguém. Se receita e despesa aparecerem
  trocadas, inverta a constante `PLUGGY_AMOUNT_SIGN` no topo desse arquivo.

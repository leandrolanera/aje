# Identidade visual — Saldo Diário

Adaptação do `IDENTIDADE-VISUAL-BASE.md` (extraído do CAMPINHO) para um app de
finanças. Leia a base primeiro; o que está aqui é só o que mudou e por quê.

**A estrutura, a tipografia e as regras de contraste não mudaram. Os matizes e
o par semântico mudaram** — e a base autoriza o primeiro (§11: "a estrutura da
paleta é mais reutilizável que os matizes"). O que se manteve: três superfícies
(escura, elevada, clara), tema único híbrido, acento vivendo só sobre o escuro,
tinta preta dentro da ficha, display condensada + texto neutro, textura em
gradiente CSS, sombra dura de impressão.

## As cinco perguntas (§2)

1. **Objeto colecionável:** a **ficha do dia** — data, saldo previsto do dia e
   os lançamentos daquele dia, num único papel creme com sombra dura. É o que
   se repete 30 vezes por mês e tem de ser reconhecível sozinho. Eram dois
   blocos soltos (um cabeçalho acima de uma caixa de linhas) e viraram um
   objeto só: o dia é a tese do app, precisa se ler como objeto.
2. **Número que importa:** o **saldo**. Vive fora da ficha, na moldura escura,
   em âmbar e em `clamp(2.6rem, 9vw, 4.25rem)` — placar de estádio, não linha
   de tabela. Ao lado dele, em corpo menor e tinta normal, o saldo do fim do mês
   e o menor saldo previsto: hierarquia, não competição (mesmo arranjo do
   OVR × valor de mercado no CAMPINHO).
3. **Mídia imitada:** o **livro-caixa** — capa escura, papel dentro, colunas,
   filetes, algarismos tabulares, filete duplo marcando a linha de hoje.
4. **Eixos de escolha:** as **categorias**, como filete lateral colorido da
   linha e preenchimento da barra. Nunca como texto.
5. **O que leva embora:** o **fechamento do mês** — ainda não existe como tela.
   É o investimento visual que falta neste projeto.

## Paleta: por que os matizes mudaram ⚠️

A base usa preto neutro `#111111` + marinho frio `#18243a` + creme, com as três
superfícies em temperaturas diferentes (o marinho está a 176° do creme, sem
nenhuma cor fazendo a ponte). O quiz resolveu indo para oliva. Aqui as
superfícies são **sépia**, todas a menos de 10° do creme:

| Papel | Var | Hex | Matiz |
|---|---|---|---|
| Fundo (moldura) | `--fundo` | `#14100b` | ~30° |
| Superfície elevada (menu do celular, campo, cabeçalho de tabela) | `--elevado` | `#453726` | ~33° |
| Ficha | `--creme` | `#f2e9d8` | ~40° |
| Acento da marca (o âmbar do livro-caixa) | `--acento` | `#e0b43c` | ~43° |

## Entra e sai são quatro tokens, não dois ⚠️

Esta é a única mudança **estrutural** em relação à base, e é o achado deste
projeto: num app de dinheiro o par que não pode ser ambíguo é *entra* × *sai*,
não as categorias. Ele precisa existir nos dois lados da metáfora — no placar,
sobre a moldura escura; e no valor da linha, dentro da ficha creme.

A base trata isso como saída de emergência (§4: "se você precisa de cor
semântica *dentro* do card, crie versões escuras separadas"). Aqui é regra:

```css
--entra: #6ecb93;  --sai: #f08a72;        /* sobre a moldura escura */
--entra-tinta: #1f6b43;  --sai-tinta: #a3372a;  /* dentro da ficha creme */
```

E a cor nunca carrega o sinal sozinha, porque vermelho × verde não sobrevive ao
daltonismo mais comum: o `+` e o `−` estão sempre no número, e **previsto se
distingue de realizado por traço, não por matiz** (filete lateral tracejado).
A opacidade que fazia esse papel antes saiu — ela rebaixava o contraste do valor
junto com o resto.

## Contrastes medidos

WCAG: 4,5 para texto normal; 3,0 para texto grande e elemento não-textual.

| Par | Medido | Mínimo | |
|---|---:|---:|---|
| separação `--fundo` → `--elevado` | 1,65 | 1,6–2,6 | ✓ lê como camada |
| `--creme` sobre `--fundo` | 15,71 | 4,5 | ✓ |
| `--creme` sobre `--elevado` | 9,53 | 4,5 | ✓ |
| `--apagado-escuro` sobre `--elevado` | 4,80 | 4,5 | ✓ |
| `--apagado-escuro` sobre `--fundo` | 7,91 | 4,5 | ✓ |
| `--acento` sobre `--fundo` | 9,71 | 4,5 | ✓ |
| `--acento` sobre `--elevado` | 5,89 | 4,5 | ✓ |
| `--fundo` sobre `--acento` (botão primário, FAB, toast) | 9,71 | 4,5 | ✓ |
| `--entra` sobre `--elevado` | 5,81 | 4,5 | ✓ |
| `--sai` sobre `--elevado` | 4,70 | 4,5 | ✓ |
| `--tinta-card` sobre `--creme` | 15,50 | 4,5 | ✓ |
| `--apagado-card` sobre `--creme` | 4,94 | 4,5 | ✓ |
| `--entra-tinta` sobre `--creme` | 5,37 | 4,5 | ✓ |
| `--sai-tinta` sobre `--creme` | 5,55 | 4,5 | ✓ |
| cores de categoria sobre `--creme` (preenchimento) | 3,54–6,31 | 3,0 | ✓ |
| ~~`--apagado-card` na etiqueta neutra~~ | 3,78 | 4,5 | ✗ — ver abaixo |

**A armadilha que só a auditoria na página renderizada pegou.** `--apagado-card`
mede 4,94 sobre o creme puro e passa. Mas a etiqueta `.pill` tem preenchimento
de `color-mix(tinta-card 12%)`, que escurece o fundo real para `#d7cfc0` — e ali
o mesmo cinza cai para **3,78**. É exatamente o aviso da base §4: composição de
camada semitransparente muda o contraste real, e medir na paleta não substitui
medir no DOM. A etiqueta ganhou tinta própria (`#544c3e`, 5,49 sobre o fundo
composto).

Pela mesma razão existem `.sub` e `.nota` como classes separadas para "texto
explicativo apagado": `--apagado-card` daria 1,9 sobre a moldura e
`--apagado-escuro` daria 1,8 dentro da ficha. Uma classe só para os dois casos é
como o erro §12.1 nasce.

## Tipografia

| Papel | No Saldo Diário | Por quê |
|---|---|---|
| Display | **Oswald** 500–700 | condensada e pesada, e — diferente do Anton do CAMPINHO/quiz — com algarismos de largura uniforme. Numa coluna de dinheiro o Anton faz a vírgula dançar de linha para linha. |
| Texto | **Figtree** 400–700 | neutra, confortável, boa no celular |
| Mono | stack do sistema | detalhe, nunca dominante |

Ambas auto-hospedadas em `fonts/`, subsets `latin` e `latin-ext` apenas. A
versão anterior carregava duas famílias de `fonts.googleapis.com`, contra §5.

A display só aparece em caixa alta e em bloco curto (manchete, rótulo, número).
Valor em dinheiro é exceção ao `uppercase`: não há o que caixa-altar em
"R$ 4.312,80" e a regra mexeria no `R$`.

## Orçamento de performance (§10)

| | Bruto | Gzip |
|---|---:|---:|
| CSS | 28 KB | 8,8 KB |
| JS | 39 KB | 14 KB |
| HTML | 1,3 KB | 0,7 KB |
| Fontes (4 subsets no deploy) | 71 KB | — |
| Fontes **baixadas** numa sessão pt-BR | 41 KB | — |

Zero requisição a terceiro. Zero imagem: ícones são SVG inline e a textura é um
`repeating-linear-gradient`.

## O que foi trocado

| Elemento | Campinho | Saldo Diário |
|---|---|---|
| Objeto colecionável | carta de decisão | ficha do dia |
| Número-símbolo | OVR | saldo |
| Mídia imitada | revista esportiva | livro-caixa |
| Eixos com cor + ícone | 5 frentes | categorias (cor sim, ícone ainda não) |
| Tela de recompensa | legado/arquétipo | **falta** — fechamento do mês |
| Paleta | preto + marinho frio + creme | **mesma estrutura, matizes trocados**: sépia + âmbar + creme, todos análogos |
| Display | Anton | Oswald (por causa dos algarismos tabulares) |
| Par semântico | — | `--entra`/`--sai` em quatro tokens (novo) |

## O que ainda não está feito

- **Ícone por categoria** (§2.4). Hoje a categoria se reconhece pela cor do
  filete e pelo nome; falta o reconhecimento *antes da leitura*. Pede reduzir as
  14 categorias a ~6 grupos, porque 14 cores não se distinguem.
- **Tela de fechamento do mês** (§2.5). É a tela que justifica ter usado o app o
  mês inteiro, e merece o maior investimento visual do projeto.
- **O FAB do celular cobre a coluna de valores** enquanto se rola a lista. É
  anterior a esta revisão, mas num app cujo ponto é a coluna da direita, incomoda
  mais do que o normal. Resolver provavelmente significa mover o "+" para dentro
  da barra inferior.

## Checklist (§13)

- [x] Respondi as cinco perguntas antes de abrir o CSS
- [x] Defini três superfícies e os acentos
- [x] Medi o contraste de cada acento sobre cada superfície e escrevi a tabela aqui
- [x] Display condensada + texto neutro, ambas auto-hospedadas
- [x] O número-símbolo é maior do que a hierarquia pediria
- [x] A textura é CSS, não imagem
- [x] Nenhuma animação em JS (a regra do CSS basta — mas se surgir uma, ela
      precisa consultar `matchMedia`, porque a media query não a alcança)
- [x] Testei a 375 px, com a string mais longa que o app pode exibir
- [x] Rodei a auditoria de contraste **na página renderizada**, nas cinco telas
      e no formulário — e foi ela que pegou o caso da etiqueta
- [ ] O objeto colecionável tem personalidade visto sozinho — a ficha do dia
      chegou perto; sem ícone de categoria, ainda não fecha

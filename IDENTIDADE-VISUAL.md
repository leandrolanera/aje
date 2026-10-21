# Identidade visual — AJÉ

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

| Papel | No AJÉ | Por quê |
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
| CSS | 40 KB | 13,2 KB |
| JS (`app.js` + `core.js`) | 63 KB | 23,2 KB |
| HTML | 1,3 KB | 0,7 KB |
| Fontes (4 subsets no deploy) | 71 KB | — |
| Fontes **baixadas** numa sessão pt-BR | 41 KB | — |

Zero requisição a terceiro. Zero imagem: ícones são SVG inline e a textura é um
`repeating-linear-gradient`.

## O que foi trocado

| Elemento | Campinho | AJÉ |
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
- ~~**O FAB do celular cobre a coluna de valores**~~ — resolvido: o "+" passou a
  viver dentro da barra inferior, como item irmão da navegação, e não flutua
  mais sobre a lista.
- **Os três cartões de KPI da Visão Geral são o mesmo molde repetido** — rótulo,
  número grande, nota, barra. E o terceiro ("sobra prevista") não é um par dos
  outros dois: é a subtração deles. Três cartões de peso igual onde um é
  conclusão dos outros é hierarquia errada, não só ritmo. A revisão de layout
  apertou o vão entre eles para que se leiam como um grupo só, mas a estrutura
  continua a de um molde de framework.

## Espaçamento

A escala é base 4, em `--e1`…`--e7`, e existe porque o ritmo vertical tinha
virado ruído: 23 valores distintos no CSS, com as seções separadas por 14–22px
— a mesma distância que havia *dentro* de cada grupo. Sem contraste entre
apertado e generoso, tudo pesa igual e o olho não acha onde um assunto termina.

A regra: `--e2`/`--e3` unem, `--e7` separa. Hoje o grupo de KPIs tem 8px entre
os cartões e 32px até a próxima seção.

Os valores internos de componente (preenchimento de `.row`, `.kpi`, `.acc`)
ainda são literais — foram afinados à mão e não foram tocados. Quem mexer neles
deve migrá-los para a escala.

## Adaptação: o que muda por largura

| Faixa | O que acontece |
|---|---:|
| ≤ 420px | O formulário vira uma coluna, menos "Data" e "Já realizado", que continuam pareados — são os dois controles curtos e respondem à mesma pergunta. Categoria e Conta não pareiam: "Saúde e bem-estar" não cabe em 164px. |
| ≤ 560px | O razão do Fluxo perde "entradas" e "saídas". Com as cinco colunas ele media 681px numa janela de 343: os dois saldos ficavam inteiramente fora da tela, e "Dia" era a coluna mais larga. O total do mês já está nos KPIs e o valor de cada lançamento está no Extrato; o saldo por dia não está em lugar nenhum. |
| ≤ 860px | Barra de navegação vai para baixo, FAB entra nela, alvos de toque sobem para 44px. O formulário vira folha de baixo, com o pé grudado. |
| ≤ 1030px | O placar vira grade: saldo na linha inteira, as duas projeções lado a lado embaixo. Em flex elas caíam como 2 + 1, com o "menor saldo" órfão. O limite é medido, não escolhido: as três cifras pedem 731px e o `.placar` só alcança isso acima de ~1030. |

## O formulário com o teclado aberto

O lançamento é o gesto mais repetido do app e acontece quase sempre no celular,
com o teclado na tela. Num iPhone 13 mini isso deixa ~470px de altura visível
para um formulário que media 746 — e o iOS **não** encolhe o viewport de layout
quando o teclado sobe, só o visual. A folha continuava com a altura toda e a
base em 812, atrás do teclado; como ela não transbordava, não havia nada pra
rolar, e o "Salvar" só existia depois de fechar o teclado.

Três decisões, nesta ordem:

1. **A altura vem do viewport visual.** `--vvh` é alimentado em `app.js` pelo
   `visualViewport` e lido em `#modal{height:min(100dvh,var(--vvh,100dvh))}`.
   O `min` é trava, não preferência: a variável só pode *encolher* o modal, e
   um valor desatualizado no pior caso não melhora nada.
2. **O pé gruda.** Erro de validação e ações são um bloco só (`.sheetend`),
   `position:sticky` no fim da folha. Mostrar "Salvar" sem mostrar o motivo da
   recusa seria pior do que não grudar nenhum dos dois.
3. **O formulário encurta.** 746 → 646px: "Data" e "Já realizado" pareados
   economizam 77px, e os alvos de toque que faltavam (Despesa/Receita media 38,
   "Já realizado" media 24) subiram para 44 sem custar altura.

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
- [x] Testei o formulário a 375×475 — a altura que sobra num 13 mini com o
      teclado aberto —, e não só a 375×812
- [x] Rodei a auditoria de contraste **na página renderizada**, nas cinco telas
      e no formulário — e foi ela que pegou o caso da etiqueta
- [ ] O objeto colecionável tem personalidade visto sozinho — a ficha do dia
      chegou perto; sem ícone de categoria, ainda não fecha

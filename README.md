# 02 — Pong

Pong com **menu inicial** (1 jogador vs CPU, ou 2 jogadores locais). Primeiro a **5 pontos** vence.

**Controles:**
- Menu: `↑`/`↓` ou `W`/`S` para navegar, `ENTER` ou `ESPAÇO` para escolher
- Esquerda: `W` / `S`
- Direita: `↑` / `↓` (no modo 2P)
- Sacar: `ESPAÇO`
- Reiniciar (após game over): `R`
- Voltar ao menu: `ESC`

**Stack:** TypeScript + Phaser 3 + Vite.

## Rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5174`.

## Estrutura

```
src/
├── main.ts                  # registra as cenas
└── scenes/
    ├── MenuScene.ts         # tela inicial com seleção de modo
    └── PongScene.ts         # partida em si (humano vs humano OU vs CPU)
```

## Conceitos novos (vs versão anterior do Pong)

### 1. Múltiplas cenas + transição

Phaser permite registrar várias cenas no `Phaser.Game`:

```ts
new Phaser.Game({ scene: [MenuScene, PongScene] });
```

A primeira do array é a inicial. Para trocar:

```ts
this.scene.start("pong");           // sai da atual, entra na "pong"
this.scene.start("pong", { mode }); // mesmo, passando dados
```

A scene `key` (string passada no `super("pong")` do constructor) é o identificador.

### 2. Comunicação entre cenas — o método `init`

Phaser chama `init(data)` **antes** de `create()`, com o objeto que você passou em `scene.start`. É o lugar ideal pra ler parâmetros e resetar estado:

```ts
init(data: { mode?: GameMode }) {
  this.mode = data.mode ?? "multi";
  this.leftScore = 0;
  // ...
}
```

**Por que `init` e não `create`?** Porque cenas **podem ser reiniciadas** (ex: você joga, vai pro menu, volta a jogar). O estado de campos da classe persiste entre execuções. `init` é onde você zera tudo. `create` cria os GameObjects do zero (eles são destruídos quando a cena sai).

### 3. AI rule-based — três regras simples

A CPU não usa machine learning. São três regras combinadas que produzem comportamento "bom o suficiente":

**Regra 1: Previsão analítica de trajetória**

Quando a bola vai em direção à paddle direita (`ballVx > 0`), calculo matematicamente onde ela vai chegar:

```ts
const t = dx / ballVx;                       // tempo até chegar no x do paddle
const naiveY = ball.y + ballVy * t;          // y se não houvesse paredes
// reflete naiveY no intervalo válido usando "triangle wave"
```

**O "triangle wave" mata os ricochetes em uma fórmula só.** Em vez de simular cada ricochete num loop, uso uma identidade matemática: reflexão entre duas paredes paralelas é equivalente a tomar o módulo do deslocamento por `2 × altura` e dobrar quando passa de `altura`. Vê em `predictBallYAtRightPaddle()`. Isso é **O(1)** em vez de O(n_ricochetes).

**Regra 2: Descanso quando bola se afasta**

Quando a bola vai pro outro lado (`ballVx < 0`), o paddle drifta suavemente pro centro. Isso é importante: sem isso, a CPU fica parada onde rebateu por último, vulnerável à próxima jogada.

**Regra 3: Imperfeição**

Três fontes de erro tornam a CPU **batível**:
- **Erro de mira aleatório** (`±18 px`) recalculado a cada "re-pensada".
- **Velocidade ligeiramente menor** que humana (360 vs 420 px/s).
- **Intervalo de re-pensar de 250ms**: a CPU não reage instantaneamente a cada frame. Ela "olha", decide, e mantém a decisão por 250ms.
- **Deadzone de 6px**: se o paddle está perto do alvo, fica parado. Evita oscilação ("jitter") em torno do alvo.

Sem essas imperfeições, a previsão é matematicamente perfeita → CPU **nunca erra** → jogo chato. **Boas IAs de jogo são deliberadamente piores que o ótimo.**

### 4. State menu navigation pattern

Padrão clássico de menu:

```ts
private selectedIndex = 0;

update() {
  if (justDown(UP))    selectedIndex = (selectedIndex - 1 + N) % N;
  if (justDown(DOWN))  selectedIndex = (selectedIndex + 1) % N;
  if (justDown(ENTER)) executeOption(selectedIndex);
  refreshHighlight();
}
```

O `+ N` antes do `% N` no UP é por causa do JavaScript: `-1 % 3 === -1`, não `2`. Adicionar `N` antes garante o módulo positivo.

### 5. Re-renderização do menu visual

Ao mudar a seleção, eu **rescrevo o texto** de cada opção (com/sem o `▶`) e troco a cor. Alternativa seria criar um único `Phaser.GameObjects.Triangle` que se move pra cima/baixo. Reescrever texto é mais simples; mover seria mais "polido". Pra menu pequeno, qualquer abordagem serve.

### 6. Resetar o `aiNextRethinkAt` em momentos-chave

Reparou no `this.aiNextRethinkAt = 0` dentro de `bounceOffPaddle` e `serve`? Isso **força a CPU a re-pensar imediatamente** quando a bola muda de direção. Sem isso, a CPU ficava com 250ms de delay reagindo a um saque — vai pro lado errado.

Lição: máquinas de estado de timing em IA precisam de **gatilhos de invalidação**. Aprende-se isso sofrendo com AIs que reagem tarde.

## Por que CPU não é "AI" de verdade

Você pediu **regras pré-definidas, sem AI** — e foi exatamente o que fiz. Vale entender a distinção:

| | Rule-based (o que fiz) | Machine Learning |
|---|---|---|
| Como decide | If/else baseado em estado atual | Modelo treinado em dados |
| Como evolui | Você muda o código | Retreina o modelo |
| Comportamento | Determinístico (mesma entrada → mesma saída) | Probabilístico |
| Custo de runtime | Quase zero | Inferência custa CPU/RAM |
| Boa para | Quase todo jogo até hoje | Casos onde regras explodem em complexidade |

99% dos jogos AAA usam **rule-based + behavior trees + finite state machines**. ML em jogos ainda é raro fora de pesquisa (AlphaStar, OpenAI Five, MarI/O). Não se preocupa com "AI de verdade" — saber projetar bons sistemas de regras é o que importa.

## Conceitos consolidados

| Conceito | Aplicação |
|----------|-----------|
| Múltiplas cenas | `MenuScene` + `PongScene` |
| `init(data)` | Recebe `mode` do menu, zera estado |
| Predição analítica | Cálculo fechado de onde a bola cai |
| Triangle wave reflection | Reflexão O(1) entre paredes paralelas |
| AI rule-based | Predição + descanso + imperfeição |
| Imperfeição deliberada | Velocidade, mira, latência, deadzone |
| Gatilho de invalidação | Reset do `aiNextRethinkAt` em eventos-chave |

## Desafios para evoluir

1. **Dificuldade variável:** adicionar uma terceira opção no menu (Fácil / Médio / Difícil), variando `AI_SPEED`, `AI_AIM_ERROR` e `AI_RETHINK_MS`.
2. **CPU vs CPU:** quarta opção "Auto" — ambos os paddles com IA. Bom pra testar balanceamento (a partida deveria oscilar, não terminar 5x0 sempre).
3. **Pausa:** tecla `P` durante a partida congela tudo, mostra overlay "PAUSADO".
4. **Histórico no menu:** persistir em `localStorage` quantas vitórias você teve vs CPU, mostrar no menu.
5. **Saque automático:** depois de 3 segundos no estado `serving`, sacar sozinho. Útil pra modo CPU vs CPU.

## Próximo

[03 — Snake](../03-snake/) (a criar): grid lógico, comida aleatória, crescimento, high score em `localStorage`.

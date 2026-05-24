# 02 — Pong

Pong de 2 jogadores locais. Primeiro à frente em **5 pontos** ganha.

**Controles:**
- Esquerda: `W` / `S`
- Direita: `↑` / `↓`
- Sacar: `ESPAÇO`
- Reiniciar (após game over): `R`

**Stack:** TypeScript + Phaser 3 + Vite.

## Rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5174` (escolhi porta diferente do projeto #01 pra você poder rodar os dois ao mesmo tempo).

## O que tem de novo aqui (vs #01)

### 1. Código em múltiplos arquivos

```
src/
├── main.ts            ← config do jogo + instância Phaser.Game
└── scenes/
    └── PongScene.ts   ← a cena com toda a lógica
```

`main.ts` virou só um "ponto de entrada". A cena é uma classe exportada de outro arquivo. **Esse padrão escala** — em jogos maiores você tem `MenuScene`, `GameScene`, `HUDScene`, cada uma no seu arquivo.

### 2. Máquina de estados de partida

```ts
type GameState = "serving" | "playing" | "gameover";
private state: GameState = "serving";
```

Em vez de variáveis booleanas espalhadas (`isPlaying`, `isWaiting`, `isOver`), uma única string com **valores válidos garantidos pelo TypeScript**. O `update` decide o que fazer:

```ts
if (this.state === "serving" && JustDown(SPACE)) this.serve();
else if (this.state === "gameover" && JustDown(R)) this.resetMatch();
else if (this.state === "playing") this.updateBall(dt);
```

State machine é **o padrão** pra gerenciar fases do jogo. No Asteroids (#05) vou usar essa ideia em escala maior.

### 3. Colisão AABB (Axis-Aligned Bounding Box) na mão

Não usei o sistema de física do Phaser propositalmente — quero que você veja a matemática crua. Dois retângulos colidem quando:

```ts
Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
Math.abs(a.y - b.y) < (a.height + b.height) / 2
```

**Por que funciona:** se o centro de `a` está a menos da metade da soma das larguras horizontalmente, eles se sobrepõem no eixo X. Mesmo no eixo Y. As duas condições → sobreposição.

É chamado "AABB" porque assume que os retângulos **não rotacionam**. Para retângulos rotacionados (carros, naves girando), usa-se SAT (Separating Axis Theorem) — bem mais complexo. Nesse caso, deixe para um engine de física resolver.

### 4. Ângulo de rebote baseado na posição de impacto

Pong sem isso é tedioso (a bola só inverte). O truque clássico:

```ts
const offset = (this.ball.y - paddle.y) / (PADDLE_H / 2);  // -1 (topo) a +1 (base)
const angle = offset * MAX_BOUNCE_ANGLE;                   // até ±60°

this.ballVx = direction * speed * Math.cos(angle);
this.ballVy = speed * Math.sin(angle);
```

**Bate no topo do paddle** → ângulo pra cima. **Bate no centro** → reto. **Bate na base** → ângulo pra baixo. Isso dá *controle estratégico* ao jogador — você "mira" com a posição do paddle. É a diferença entre Pong genérico e Pong divertido.

### 5. Aceleração progressiva da bola

```ts
this.ballSpeed += BALL_SPEED_INCREMENT;
```

A cada rebatida em paddle, a bola fica 25 px/s mais rápida. Resseta a cada ponto. Mantém a partida tensa em vez de monótona.

### 6. "Nudge" pra fora do paddle após colisão

Depois de detectar a colisão e inverter a velocidade, eu **reposiciono a bola** logo fora do paddle:

```ts
this.ball.x = direction === 1 ? paddle.x + halfP + halfB : paddle.x - halfP - halfB;
```

Por quê? Se eu só inverter `vx` e a bola estiver *dentro* do paddle naquele frame, no frame seguinte ela ainda está dentro → detecto colisão de novo → inverto de novo → fica grudada. Esse é o **bug da "bola fritando" no paddle**. A correção: garantir que a bola saia do paddle no mesmo frame.

### 7. Cap no `dt` para evitar tunneling

```ts
const dt = Math.min(delta, MAX_DT_MS) / 1000;  // limita a 33ms (~30 FPS pior caso)
```

Lembra do que falei no #01? Se um frame demorar 100ms (você arrastou a janela, abriu o devtools), a bola se move `400 px/s × 0.1s = 40 px` num único frame — pode pular por cima do paddle sem registrar. Limitando o `dt`, no pior caso a bola anda menos e a colisão pega. O jogo "engasga" visualmente, mas **continua jogável** em vez de bugar.

### 8. `JustDown` vs `isDown`

- `key.isDown` — true enquanto a tecla está pressionada (polling contínuo).
- `Phaser.Input.Keyboard.JustDown(key)` — true **só no frame em que a tecla foi pressionada**.

Pra movimento contínuo (paddle subindo enquanto seguro W) → `isDown`.
Pra ação única (sacar, reiniciar, pular) → `JustDown`. Se eu usasse `isDown` no SPACE, segurar a tecla daria múltiplos saques no mesmo serve.

### 9. `setOrigin(x, y)` em texto

```ts
this.add.text(...).setOrigin(1, 0);   // âncora no canto superior direito
this.add.text(...).setOrigin(0.5);    // âncora no centro
```

O **origin** é o ponto do objeto que fica em `(x, y)`. Padrão é `(0.5, 0.5)` para shapes e `(0, 0)` para texto. Usei `(1, 0)` no score esquerdo pra alinhá-lo à direita do número (assim "0" e "10" ficam alinhados no mesmo lugar, em vez de "0" deslocando quando vira "10").

## Conceitos novos consolidados

| Conceito | Aplicação |
|----------|-----------|
| Organização em módulos | `scenes/` separado de `main.ts` |
| State machine | `serving` / `playing` / `gameover` |
| AABB collision | `intersects(a, b)` |
| `JustDown` vs `isDown` | Ação única vs contínua |
| Reflexão com ângulo | Rebote estratégico no paddle |
| Tunneling e cap de dt | Robustez do game loop |
| Resolution de penetração | "Nudge" pós-colisão |
| `setOrigin` | Alinhamento de texto/objetos |

## Desafios para evoluir

1. **CPU oponente:** substituir a paddle direita por uma IA que segue a bola (com `lerp` pra ela errar às vezes — IA perfeita não é divertida).
2. **Efeitos de impacto:** pequeno "screen shake" quando a bola bate em paddle (`this.cameras.main.shake(80, 0.005)`).
3. **Power-ups:** spawn periódico de um quadrado colorido no centro; pegou → próximo saque, sua paddle dobra de tamanho por 5 segundos.
4. **Áudio:** beep curto no rebote em paddle, beep diferente no ponto. Pode gerar tom com `AudioContext` puro ou carregar um `.wav`.
5. **Menu inicial:** uma cena `MenuScene` com "PONG" gigante e "ESPAÇO pra começar", antes do `PongScene`.

## Próximo

[03 — Snake](../03-snake/) (a criar): lógica em grid, spawn aleatório de comida, crescimento da cobra, persistência de high score em `localStorage`.

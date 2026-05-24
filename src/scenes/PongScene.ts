import Phaser from "phaser";
import { COLOR_HEX, TEXT_PRESETS } from "../theme";
import { drawDiagonalScanlines, createPulsingDot, addCornerLabel } from "../ui";
import { takeScreenshot } from "../screenshot";
import { playTone } from "../audio";
import { isTouchDevice } from "../input";
import { CAMPAIGN_PHASE_KEY, type AiDifficulty, type GameMode } from "./MenuScene";

const WIDTH = 800;
const HEIGHT = 600;
const PADDLE_W = 12;
const PADDLE_MARGIN = 30;
const PADDLE_SPEED = 420;
const BALL_SIZE = 14;
const BALL_SPEED_START = 380;
const BALL_SPEED_INCREMENT = 22;
const MAX_BOUNCE_ANGLE = Math.PI / 3;
const MAX_DT_MS = 33;
const TRAIL_LENGTH = 9;

const AI_PROFILES: Record<AiDifficulty, { speed: number; aimError: number; rethinkMs: number; deadzone: number }> = {
  easy:   { speed: 240, aimError: 36, rethinkMs: 360, deadzone: 10 },
  normal: { speed: 340, aimError: 18, rethinkMs: 250, deadzone: 6 },
  hard:   { speed: 420, aimError: 8,  rethinkMs: 160, deadzone: 4 },
};

interface PhaseRules {
  paddleH: number;
  numBalls: number;
  invisibleBall: boolean;     // fase 4
  centerObstacle: boolean;    // fase 5
  winScore: number;
  aiDifficulty: AiDifficulty; // só usado em modos com CPU
}

const CAMPAIGN_PHASES: PhaseRules[] = [
  { paddleH: 90,  numBalls: 1, invisibleBall: false, centerObstacle: false, winScore: 3, aiDifficulty: "normal" },
  { paddleH: 60,  numBalls: 1, invisibleBall: false, centerObstacle: false, winScore: 3, aiDifficulty: "normal" },
  { paddleH: 90,  numBalls: 2, invisibleBall: false, centerObstacle: false, winScore: 4, aiDifficulty: "normal" },
  { paddleH: 90,  numBalls: 1, invisibleBall: true,  centerObstacle: false, winScore: 3, aiDifficulty: "normal" },
  { paddleH: 90,  numBalls: 1, invisibleBall: false, centerObstacle: true,  winScore: 3, aiDifficulty: "hard"   },
];

const TWOPLAYER_RULES: PhaseRules = { paddleH: 90, numBalls: 1, invisibleBall: false, centerObstacle: false, winScore: 5, aiDifficulty: "normal" };
const TRAINING_RULES = (diff: AiDifficulty): PhaseRules =>
  ({ paddleH: 90, numBalls: 1, invisibleBall: false, centerObstacle: false, winScore: 5, aiDifficulty: diff });

interface Ball {
  rect: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  speed: number;
  trail: Array<{ x: number; y: number }>;
  visible: boolean;
}

type GameState = "serving" | "playing" | "gameover" | "phasecleared" | "campaigncomplete";
type Side = "left" | "right";

interface SceneInitData {
  mode?: GameMode;
  phase?: number;
  difficulty?: AiDifficulty;
}

export class PongScene extends Phaser.Scene {
  private mode: GameMode = "twoplayer";
  private phase = 1;
  private rules: PhaseRules = TWOPLAYER_RULES;

  private leftPaddle!: Phaser.GameObjects.Rectangle;
  private rightPaddle!: Phaser.GameObjects.Rectangle;
  private balls: Ball[] = [];
  private trailGraphics!: Phaser.GameObjects.Graphics;
  private obstacle: Phaser.GameObjects.Rectangle | null = null;
  private obstacleDir = 1;

  private leftScore = 0;
  private rightScore = 0;
  private leftScoreText!: Phaser.GameObjects.Text;
  private rightScoreText!: Phaser.GameObjects.Text;

  private overlayBg!: Phaser.GameObjects.Rectangle;
  private overlayTitle!: Phaser.GameObjects.Text;
  private overlaySubtitle!: Phaser.GameObjects.Text;
  private overlayHint!: Phaser.GameObjects.Text;

  private state: GameState = "serving";
  private serveDirection: 1 | -1 = 1;

  private aiTargetY = HEIGHT / 2;
  private aiAimError = 0;
  private aiNextRethinkAt = 0;

  private keys!: Record<
    "W" | "S" | "UP" | "DOWN" | "SPACE" | "R" | "ESC" | "K" | "P",
    Phaser.Input.Keyboard.Key
  >;

  constructor() {
    super("pong");
  }

  init(data: SceneInitData) {
    this.mode = data.mode ?? "twoplayer";
    this.phase = data.phase ?? 1;
    if (this.mode === "campaign") {
      this.rules = CAMPAIGN_PHASES[Math.min(Math.max(this.phase, 1), 5) - 1];
    } else if (this.mode === "training") {
      this.rules = TRAINING_RULES(data.difficulty ?? "normal");
    } else {
      this.rules = TWOPLAYER_RULES;
    }
    this.leftScore = 0;
    this.rightScore = 0;
    this.state = "serving";
    this.serveDirection = 1;
    this.aiNextRethinkAt = 0;
    this.balls = [];
  }

  create() {
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLOR_HEX.bg);
    drawDiagonalScanlines(this, WIDTH, HEIGHT, 18, 0.04);
    this.drawCenterLine();

    this.trailGraphics = this.add.graphics();

    this.leftPaddle = this.add.rectangle(PADDLE_MARGIN, HEIGHT / 2, PADDLE_W, this.rules.paddleH, COLOR_HEX.fg);
    this.rightPaddle = this.add.rectangle(WIDTH - PADDLE_MARGIN, HEIGHT / 2, PADDLE_W, this.rules.paddleH, COLOR_HEX.fg);

    if (this.rules.centerObstacle) {
      this.obstacle = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 16, 100, COLOR_HEX.border);
      this.obstacle.setStrokeStyle(1, COLOR_HEX.muted, 1);
    }

    for (let i = 0; i < this.rules.numBalls; i++) {
      this.spawnBall();
    }

    // chrome
    addCornerLabel(this, 22, 22, "/ 02", "PONG", false);
    createPulsingDot(this, WIDTH - 22 - 4, 22 + 6, 4, COLOR_HEX.accent);
    this.add
      .text(WIDTH - 38, 22, this.statusText(), TEXT_PRESETS.monoLabel)
      .setOrigin(1, 0);
    this.add
      .text(WIDTH - 22, 44, this.metaText(), TEXT_PRESETS.hint)
      .setOrigin(1, 0);

    this.add.text(22, HEIGHT - 22, this.bottomLeftChrome(), TEXT_PRESETS.hint).setOrigin(0, 1);
    this.add.text(WIDTH - 22, HEIGHT - 22, this.controlsHint(), TEXT_PRESETS.hint).setOrigin(1, 1);

    // score grande no topo central
    const scoreStyle = { ...TEXT_PRESETS.heroOutline, fontSize: "72px" };
    this.leftScoreText = this.add.text(WIDTH / 2 - 60, 50, "0", scoreStyle).setOrigin(1, 0);
    this.rightScoreText = this.add.text(WIDTH / 2 + 60, 50, "0", scoreStyle).setOrigin(0, 0);

    // overlay
    this.overlayBg = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLOR_HEX.bg, 0.82);
    this.overlayTitle = this.add
      .text(WIDTH / 2, HEIGHT / 2 - 70, "", TEXT_PRESETS.heroOutline)
      .setOrigin(0.5)
      .setFontSize("80px");
    this.overlaySubtitle = this.add
      .text(WIDTH / 2, HEIGHT / 2 + 10, "", TEXT_PRESETS.body)
      .setOrigin(0.5);
    this.overlayHint = this.add
      .text(WIDTH / 2, HEIGHT / 2 + 60, "", TEXT_PRESETS.hint)
      .setOrigin(0.5);

    const kb = this.input.keyboard!;
    this.keys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      R: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      ESC: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      K: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      P: kb.addKey(Phaser.Input.Keyboard.KeyCodes.P),
    };

    this.showServingOverlay();

    // Touch: drag vertical em cada metade move o paddle correspondente.
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      this.handlePointerMove(pointer);
    });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.handlePointerMove(pointer);
      if (this.state === "serving") this.serve();
      else if (this.state === "gameover") this.restartMatch();
      else if (this.state === "phasecleared") {
        this.scene.start("pong", { mode: "campaign", phase: this.phase + 1 });
      } else if (this.state === "campaigncomplete") this.scene.start("menu");
    });
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    const half = this.rules.paddleH / 2;
    const clampedY = Phaser.Math.Clamp(pointer.y, half, HEIGHT - half);
    if (pointer.x < WIDTH / 2) {
      this.leftPaddle.y = clampedY;
    } else if (this.mode === "twoplayer") {
      this.rightPaddle.y = clampedY;
    }
  }

  private drawCenterLine() {
    const g = this.add.graphics();
    g.fillStyle(COLOR_HEX.border, 0.7);
    for (let y = 12; y < HEIGHT - 12; y += 16) {
      g.fillRect(WIDTH / 2 - 1, y, 2, 8);
    }
  }

  private bottomLeftChrome(): string {
    if (this.mode === "campaign") return `GAMEDEV.02 · CAMPANHA F${this.phase}`;
    if (this.mode === "training") return `GAMEDEV.02 · TREINO ${this.rules.aiDifficulty.toUpperCase()}`;
    return "GAMEDEV.02 · 2 JOGADORES";
  }

  private controlsHint(): string {
    if (isTouchDevice()) {
      return this.mode === "twoplayer"
        ? "ARRASTE METADE ESQ/DIR · TOQUE PRA SACAR"
        : "ARRASTE PRA MOVER · TOQUE PRA SACAR";
    }
    if (this.mode === "twoplayer") return "W/S · ↑/↓ · ESPAÇO SACAR · ESC MENU · K SCREENSHOT";
    return "W/S · CPU À DIREITA · ESPAÇO SACAR · ESC MENU · K";
  }

  private statusText(): string {
    return `META ${this.rules.winScore}  ·  BOLAS ${this.rules.numBalls}`;
  }

  private metaText(): string {
    const bits: string[] = [];
    if (this.rules.paddleH < 90) bits.push("PADDLE -33%");
    if (this.rules.invisibleBall) bits.push("BOLA INTERMITENTE");
    if (this.rules.centerObstacle) bits.push("OBSTÁCULO CENTRAL");
    return bits.join(" · ");
  }

  private spawnBall() {
    const rect = this.add.rectangle(WIDTH / 2, HEIGHT / 2, BALL_SIZE, BALL_SIZE, COLOR_HEX.accent);
    this.balls.push({ rect, vx: 0, vy: 0, speed: BALL_SPEED_START, trail: [], visible: true });
  }

  update(time: number, delta: number) {
    if (Phaser.Input.Keyboard.JustDown(this.keys.K)) {
      takeScreenshot(this.game, `gamedev-02-pong-${this.mode}`);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.scene.start("menu");
      return;
    }

    const dt = Math.min(delta, MAX_DT_MS) / 1000;

    this.updatePaddles(time, dt);
    if (this.obstacle) this.updateObstacle(dt);
    if (this.rules.invisibleBall) this.updateBallVisibility(time);

    if (this.state === "serving" && Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
      this.serve();
    } else if (this.state === "gameover" && Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.restartMatch();
    } else if (this.state === "phasecleared" && Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
      this.scene.start("pong", { mode: "campaign", phase: this.phase + 1 });
    } else if (this.state === "campaigncomplete" && Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
      this.scene.start("menu");
    } else if (this.state === "playing") {
      this.updateBalls(dt);
    }

    this.drawTrails();
  }

  // ---------- paddles ----------

  private updatePaddles(time: number, dt: number) {
    const half = this.rules.paddleH / 2;

    // left = jogador 1 sempre
    if (this.keys.W.isDown) this.leftPaddle.y -= PADDLE_SPEED * dt;
    if (this.keys.S.isDown) this.leftPaddle.y += PADDLE_SPEED * dt;
    this.leftPaddle.y = Phaser.Math.Clamp(this.leftPaddle.y, half, HEIGHT - half);

    if (this.mode === "twoplayer") {
      if (this.keys.UP.isDown) this.rightPaddle.y -= PADDLE_SPEED * dt;
      if (this.keys.DOWN.isDown) this.rightPaddle.y += PADDLE_SPEED * dt;
      this.rightPaddle.y = Phaser.Math.Clamp(this.rightPaddle.y, half, HEIGHT - half);
    } else {
      this.updateAiPaddle(time, dt);
    }
  }

  private updateAiPaddle(time: number, dt: number) {
    const profile = AI_PROFILES[this.rules.aiDifficulty];
    if (time >= this.aiNextRethinkAt) {
      // mira pra bola que vem mais perto (em fase 3 com 2 bolas)
      const target = this.predictNearestApproachingBallY();
      this.aiTargetY = target;
      this.aiAimError = Phaser.Math.FloatBetween(-profile.aimError, profile.aimError);
      this.aiNextRethinkAt = time + profile.rethinkMs;
    }

    const target = this.aiTargetY + this.aiAimError;
    const diff = target - this.rightPaddle.y;
    if (Math.abs(diff) > profile.deadzone) {
      this.rightPaddle.y += Math.sign(diff) * profile.speed * dt;
    }
    const half = this.rules.paddleH / 2;
    this.rightPaddle.y = Phaser.Math.Clamp(this.rightPaddle.y, half, HEIGHT - half);
  }

  private predictNearestApproachingBallY(): number {
    let best: number | null = null;
    let minDist = Infinity;
    for (const ball of this.balls) {
      if (ball.vx <= 0) continue;
      const dist = (this.rightPaddle.x - ball.rect.x);
      if (dist < 0) continue;
      if (dist < minDist) {
        minDist = dist;
        best = this.predictBallYAtRightPaddle(ball);
      }
    }
    return best ?? HEIGHT / 2;
  }

  private predictBallYAtRightPaddle(ball: Ball): number {
    const targetX = this.rightPaddle.x - PADDLE_W / 2 - BALL_SIZE / 2;
    const dx = targetX - ball.rect.x;
    if (dx <= 0 || ball.vx <= 0) return ball.rect.y;
    const t = dx / ball.vx;
    const naiveY = ball.rect.y + ball.vy * t;
    const halfBall = BALL_SIZE / 2;
    const minY = halfBall;
    const maxY = HEIGHT - halfBall;
    const range = maxY - minY;
    let rel = (((naiveY - minY) % (2 * range)) + 2 * range) % (2 * range);
    if (rel > range) rel = 2 * range - rel;
    return minY + rel;
  }

  // ---------- bolas ----------

  private updateBalls(dt: number) {
    for (const ball of this.balls) {
      ball.rect.x += ball.vx * dt;
      ball.rect.y += ball.vy * dt;

      // trail (somente quando visível, pra não desenhar trail invisível)
      if (ball.visible) {
        ball.trail.unshift({ x: ball.rect.x, y: ball.rect.y });
        if (ball.trail.length > TRAIL_LENGTH) ball.trail.pop();
      }

      // colisão com paredes top/bottom
      const halfBall = BALL_SIZE / 2;
      if (ball.rect.y - halfBall < 0) {
        ball.rect.y = halfBall;
        ball.vy = Math.abs(ball.vy);
      } else if (ball.rect.y + halfBall > HEIGHT) {
        ball.rect.y = HEIGHT - halfBall;
        ball.vy = -Math.abs(ball.vy);
      }

      // paddle collisions
      if (ball.vx < 0 && this.intersects(ball.rect, this.leftPaddle)) {
        this.bounceOffPaddle(ball, this.leftPaddle, 1);
      } else if (ball.vx > 0 && this.intersects(ball.rect, this.rightPaddle)) {
        this.bounceOffPaddle(ball, this.rightPaddle, -1);
      }

      // obstáculo central
      if (this.obstacle && this.intersects(ball.rect, this.obstacle)) {
        const ballCx = ball.rect.x;
        const obsCx = this.obstacle.x;
        if (ballCx < obsCx) {
          ball.rect.x = obsCx - this.obstacle.width / 2 - halfBall;
          ball.vx = -Math.abs(ball.vx);
        } else {
          ball.rect.x = obsCx + this.obstacle.width / 2 + halfBall;
          ball.vx = Math.abs(ball.vx);
        }
        playTone(330, 70, "sine", 0.13);
      }

      // pontuação
      if (ball.rect.x + halfBall < 0) {
        this.scorePoint("right", ball);
      } else if (ball.rect.x - halfBall > WIDTH) {
        this.scorePoint("left", ball);
      }
    }
  }

  private intersects(a: Phaser.GameObjects.Rectangle, b: Phaser.GameObjects.Rectangle): boolean {
    return (
      Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
      Math.abs(a.y - b.y) < (a.height + b.height) / 2
    );
  }

  private bounceOffPaddle(ball: Ball, paddle: Phaser.GameObjects.Rectangle, xDirection: 1 | -1) {
    const offset = Phaser.Math.Clamp((ball.rect.y - paddle.y) / (this.rules.paddleH / 2), -1, 1);
    const angle = offset * MAX_BOUNCE_ANGLE;
    ball.speed += BALL_SPEED_INCREMENT;
    ball.vx = xDirection * ball.speed * Math.cos(angle);
    ball.vy = ball.speed * Math.sin(angle);

    const halfP = PADDLE_W / 2;
    const halfB = BALL_SIZE / 2;
    ball.rect.x = xDirection === 1 ? paddle.x + halfP + halfB : paddle.x - halfP - halfB;

    playTone(xDirection === 1 ? 440 : 523, 90, "square", 0.12);
    this.cameras.main.shake(60, 0.003);
    this.aiNextRethinkAt = 0;
  }

  private updateBallVisibility(time: number) {
    // ciclo: visível 700ms, invisível 350ms
    const cycle = 1050;
    const phase = time % cycle;
    const visible = phase < 700;
    for (const ball of this.balls) {
      if (ball.visible !== visible) {
        ball.visible = visible;
        ball.rect.setVisible(visible);
      }
    }
  }

  private updateObstacle(dt: number) {
    if (!this.obstacle) return;
    this.obstacle.y += this.obstacleDir * 80 * dt;
    if (this.obstacle.y < 120) {
      this.obstacle.y = 120;
      this.obstacleDir = 1;
    } else if (this.obstacle.y > HEIGHT - 120) {
      this.obstacle.y = HEIGHT - 120;
      this.obstacleDir = -1;
    }
  }

  // ---------- score ----------

  private scorePoint(side: Side, ball: Ball) {
    if (side === "left") this.leftScore++;
    else this.rightScore++;

    this.leftScoreText.setText(String(this.leftScore));
    this.rightScoreText.setText(String(this.rightScore));

    playTone(side === "left" ? 660 : 392, 200, "triangle", 0.16);
    this.cameras.main.shake(140, 0.006);

    // se atingiu o win score
    if (this.leftScore >= this.rules.winScore || this.rightScore >= this.rules.winScore) {
      this.endMatch();
      return;
    }

    // múltiplas bolas: reseta só a que saiu, mantém as outras vivas
    if (this.balls.length > 1) {
      ball.rect.setPosition(WIDTH / 2, HEIGHT / 2);
      ball.vx = 0;
      ball.vy = 0;
      ball.speed = BALL_SPEED_START;
      ball.trail = [];
      this.serveSingleBall(ball, side === "left" ? -1 : 1);
    } else {
      this.resetBall(side === "left" ? -1 : 1);
    }
  }

  private resetBall(nextServeDirection: 1 | -1) {
    for (const ball of this.balls) {
      ball.rect.setPosition(WIDTH / 2, HEIGHT / 2);
      ball.vx = 0;
      ball.vy = 0;
      ball.speed = BALL_SPEED_START;
      ball.trail = [];
      ball.visible = true;
      ball.rect.setVisible(true);
    }
    this.serveDirection = nextServeDirection;
    this.state = "serving";
    this.showServingOverlay();
  }

  private serve() {
    this.hideOverlay();
    this.state = "playing";
    // num bolas: serve todas com leves variações
    this.balls.forEach((ball, i) => {
      const baseAngle = Phaser.Math.FloatBetween(-Math.PI / 6, Math.PI / 6);
      const dir = i === 0 ? this.serveDirection : (Math.random() < 0.5 ? -1 : 1) as 1 | -1;
      ball.vx = dir * ball.speed * Math.cos(baseAngle);
      ball.vy = ball.speed * Math.sin(baseAngle);
    });
    this.aiNextRethinkAt = 0;
  }

  private serveSingleBall(ball: Ball, direction: 1 | -1) {
    const angle = Phaser.Math.FloatBetween(-Math.PI / 6, Math.PI / 6);
    ball.vx = direction * ball.speed * Math.cos(angle);
    ball.vy = ball.speed * Math.sin(angle);
  }

  private endMatch() {
    this.state = "gameover";
    for (const ball of this.balls) {
      ball.vx = 0;
      ball.vy = 0;
    }

    const playerWon = this.leftScore > this.rightScore;
    if (this.mode === "campaign" && playerWon) {
      // avanca campanha
      const nextPhase = this.phase + 1;
      this.saveCampaignPhase(Math.max(this.loadCampaignPhase(), nextPhase));
      if (this.phase >= 5) {
        this.state = "campaigncomplete";
        this.showOverlay("CAMPANHA", "você dominou todas as 5 fases", "ESPAÇO VOLTAR AO MENU");
        return;
      }
      this.state = "phasecleared";
      this.showOverlay(`FASE ${String(this.phase).padStart(2, "0")}`, `vitória ${this.leftScore}-${this.rightScore}`, "ESPAÇO PRÓXIMA FASE  ·  ESC MENU");
      return;
    }

    // gameover normal (perdeu campanha, ou treino, ou 2P terminou)
    let title = "FIM";
    let subtitle = "";
    if (this.mode === "twoplayer") {
      subtitle = `${playerWon ? "ESQUERDA" : "DIREITA"} venceu  ${this.leftScore}-${this.rightScore}`;
    } else if (this.mode === "campaign") {
      subtitle = `derrota na fase ${this.phase}  ${this.leftScore}-${this.rightScore}`;
    } else {
      subtitle = `${playerWon ? "VOCÊ" : "CPU"} venceu  ${this.leftScore}-${this.rightScore}`;
    }
    this.showOverlay(title, subtitle, "R TENTAR DE NOVO  ·  ESC MENU");
  }

  private restartMatch() {
    if (this.mode === "campaign") {
      this.scene.start("pong", { mode: "campaign", phase: this.phase });
    } else {
      this.scene.start("pong", { mode: this.mode, difficulty: this.rules.aiDifficulty, phase: 1 });
    }
  }

  // ---------- overlay ----------

  private showServingOverlay() {
    let title = "PRONTO?";
    let subtitle = this.metaText() || "primeiro a marcar saca";
    if (this.mode === "campaign") {
      title = `FASE ${String(this.phase).padStart(2, "0")}`;
      subtitle = `meta ${this.rules.winScore}${this.metaText() ? "  ·  " + this.metaText() : ""}`;
    }
    this.showOverlay(title, subtitle, "ESPAÇO SACAR  ·  ESC MENU");
  }

  private showOverlay(title: string, subtitle: string, hint: string) {
    this.overlayBg.setVisible(true);
    this.overlayTitle.setVisible(true).setText(title);
    this.overlaySubtitle.setVisible(true).setText(subtitle);
    this.overlayHint.setVisible(true).setText(hint);
  }

  private hideOverlay() {
    this.overlayBg.setVisible(false);
    this.overlayTitle.setVisible(false);
    this.overlaySubtitle.setVisible(false);
    this.overlayHint.setVisible(false);
  }

  // ---------- trails ----------

  private drawTrails() {
    this.trailGraphics.clear();
    for (const ball of this.balls) {
      if (!ball.visible) continue;
      for (let i = 0; i < ball.trail.length; i++) {
        const t = ball.trail[i];
        const alpha = (1 - i / TRAIL_LENGTH) * 0.42;
        const size = BALL_SIZE - i;
        this.trailGraphics.fillStyle(COLOR_HEX.accent, alpha);
        this.trailGraphics.fillRect(t.x - size / 2, t.y - size / 2, size, size);
      }
    }
  }

  // ---------- persistência ----------

  private loadCampaignPhase(): number {
    try {
      const raw = localStorage.getItem(CAMPAIGN_PHASE_KEY);
      const n = raw ? parseInt(raw, 10) : 1;
      return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1;
    } catch {
      return 1;
    }
  }

  private saveCampaignPhase(phase: number) {
    try {
      localStorage.setItem(CAMPAIGN_PHASE_KEY, String(Math.min(5, phase)));
    } catch {}
  }
}

import Phaser from "phaser";

const WIDTH = 800;
const HEIGHT = 600;
const PADDLE_W = 12;
const PADDLE_H = 90;
const PADDLE_MARGIN = 30;
const PADDLE_SPEED = 420;
const BALL_SIZE = 14;
const BALL_SPEED_START = 380;
const BALL_SPEED_INCREMENT = 25;
const MAX_BOUNCE_ANGLE = Math.PI / 3;
const WIN_SCORE = 5;
const MAX_DT_MS = 33;

type GameState = "serving" | "playing" | "gameover";
type Side = "left" | "right";

export class PongScene extends Phaser.Scene {
  private leftPaddle!: Phaser.GameObjects.Rectangle;
  private rightPaddle!: Phaser.GameObjects.Rectangle;
  private ball!: Phaser.GameObjects.Rectangle;
  private leftScoreText!: Phaser.GameObjects.Text;
  private rightScoreText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;

  private ballVx = 0;
  private ballVy = 0;
  private ballSpeed = BALL_SPEED_START;
  private leftScore = 0;
  private rightScore = 0;
  private state: GameState = "serving";
  private serveDirection: 1 | -1 = 1;

  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
    R: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("pong");
  }

  create() {
    for (let y = 10; y < HEIGHT; y += 20) {
      this.add.rectangle(WIDTH / 2, y, 2, 10, 0x334155);
    }

    this.leftPaddle = this.add.rectangle(PADDLE_MARGIN, HEIGHT / 2, PADDLE_W, PADDLE_H, 0xffffff);
    this.rightPaddle = this.add.rectangle(WIDTH - PADDLE_MARGIN, HEIGHT / 2, PADDLE_W, PADDLE_H, 0xffffff);
    this.ball = this.add.rectangle(WIDTH / 2, HEIGHT / 2, BALL_SIZE, BALL_SIZE, 0xffffff);

    const scoreStyle = { fontFamily: "monospace", fontSize: "48px", color: "#e2e8f0" };
    this.leftScoreText = this.add.text(WIDTH / 2 - 60, 30, "0", scoreStyle).setOrigin(1, 0);
    this.rightScoreText = this.add.text(WIDTH / 2 + 60, 30, "0", scoreStyle).setOrigin(0, 0);

    this.messageText = this.add
      .text(WIDTH / 2, HEIGHT - 40, "ESPAÇO para sacar  •  W/S esquerda  •  ↑/↓ direita", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#94a3b8",
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard!;
    this.keys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      R: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };
  }

  update(_time: number, delta: number) {
    const dt = Math.min(delta, MAX_DT_MS) / 1000;

    this.updatePaddles(dt);

    if (this.state === "serving" && Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
      this.serve();
    } else if (this.state === "gameover" && Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.resetMatch();
    } else if (this.state === "playing") {
      this.updateBall(dt);
    }
  }

  private updatePaddles(dt: number) {
    const half = PADDLE_H / 2;

    if (this.keys.W.isDown) this.leftPaddle.y -= PADDLE_SPEED * dt;
    if (this.keys.S.isDown) this.leftPaddle.y += PADDLE_SPEED * dt;
    if (this.keys.UP.isDown) this.rightPaddle.y -= PADDLE_SPEED * dt;
    if (this.keys.DOWN.isDown) this.rightPaddle.y += PADDLE_SPEED * dt;

    this.leftPaddle.y = Phaser.Math.Clamp(this.leftPaddle.y, half, HEIGHT - half);
    this.rightPaddle.y = Phaser.Math.Clamp(this.rightPaddle.y, half, HEIGHT - half);
  }

  private updateBall(dt: number) {
    this.ball.x += this.ballVx * dt;
    this.ball.y += this.ballVy * dt;

    const halfBall = BALL_SIZE / 2;

    if (this.ball.y - halfBall < 0) {
      this.ball.y = halfBall;
      this.ballVy = Math.abs(this.ballVy);
    } else if (this.ball.y + halfBall > HEIGHT) {
      this.ball.y = HEIGHT - halfBall;
      this.ballVy = -Math.abs(this.ballVy);
    }

    if (this.ballVx < 0 && this.intersects(this.ball, this.leftPaddle)) {
      this.bounceOffPaddle(this.leftPaddle, 1);
    } else if (this.ballVx > 0 && this.intersects(this.ball, this.rightPaddle)) {
      this.bounceOffPaddle(this.rightPaddle, -1);
    }

    if (this.ball.x + halfBall < 0) {
      this.scorePoint("right");
    } else if (this.ball.x - halfBall > WIDTH) {
      this.scorePoint("left");
    }
  }

  private intersects(a: Phaser.GameObjects.Rectangle, b: Phaser.GameObjects.Rectangle): boolean {
    return (
      Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
      Math.abs(a.y - b.y) < (a.height + b.height) / 2
    );
  }

  private bounceOffPaddle(paddle: Phaser.GameObjects.Rectangle, xDirection: 1 | -1) {
    const offset = Phaser.Math.Clamp((this.ball.y - paddle.y) / (PADDLE_H / 2), -1, 1);
    const angle = offset * MAX_BOUNCE_ANGLE;

    this.ballSpeed += BALL_SPEED_INCREMENT;
    this.ballVx = xDirection * this.ballSpeed * Math.cos(angle);
    this.ballVy = this.ballSpeed * Math.sin(angle);

    const halfP = PADDLE_W / 2;
    const halfB = BALL_SIZE / 2;
    this.ball.x = xDirection === 1 ? paddle.x + halfP + halfB : paddle.x - halfP - halfB;
  }

  private scorePoint(scoringSide: Side) {
    if (scoringSide === "left") this.leftScore++;
    else this.rightScore++;

    this.leftScoreText.setText(String(this.leftScore));
    this.rightScoreText.setText(String(this.rightScore));

    if (this.leftScore >= WIN_SCORE || this.rightScore >= WIN_SCORE) {
      this.endMatch();
    } else {
      this.resetBall(scoringSide === "left" ? -1 : 1);
    }
  }

  private resetBall(nextServeDirection: 1 | -1) {
    this.ball.setPosition(WIDTH / 2, HEIGHT / 2);
    this.ballVx = 0;
    this.ballVy = 0;
    this.ballSpeed = BALL_SPEED_START;
    this.serveDirection = nextServeDirection;
    this.state = "serving";
    this.messageText.setText("ESPAÇO para sacar");
  }

  private serve() {
    const angle = Phaser.Math.FloatBetween(-Math.PI / 6, Math.PI / 6);
    this.ballVx = this.serveDirection * this.ballSpeed * Math.cos(angle);
    this.ballVy = this.ballSpeed * Math.sin(angle);
    this.state = "playing";
    this.messageText.setText("");
  }

  private endMatch() {
    this.state = "gameover";
    this.ballVx = 0;
    this.ballVy = 0;
    const winner = this.leftScore >= WIN_SCORE ? "ESQUERDA" : "DIREITA";
    this.messageText.setText(`${winner} venceu  •  R para reiniciar`);
  }

  private resetMatch() {
    this.leftScore = 0;
    this.rightScore = 0;
    this.leftScoreText.setText("0");
    this.rightScoreText.setText("0");
    this.resetBall(Math.random() < 0.5 ? -1 : 1);
  }
}

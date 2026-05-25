import Phaser from "phaser";
import { COLORS, COLOR_HEX, TEXT_PRESETS } from "../theme";
import { drawDiagonalScanlines, createPulsingDot, addCornerLabel } from "../ui";
import { takeScreenshot } from "../screenshot";
import { unlockAudio } from "../audio";
import { isTouchDevice } from "../input";

const CAMPAIGN_PHASE_KEY = "gamedev-02-pong-campaign-phase";

export type GameMode = "campaign" | "twoplayer" | "training";
export type AiDifficulty = "easy" | "normal" | "hard";

interface MenuOption {
  label: string;
  description: string;
  mode: GameMode;
  difficulty?: AiDifficulty;
}

const OPTIONS: MenuOption[] = [
  { label: "CAMPANHA",              description: "5 fases vs CPU com mecânicas que mudam",   mode: "campaign" },
  { label: "2 JOGADORES (LOCAL)",   description: "primeiro a 5 pontos vence",                  mode: "twoplayer" },
  { label: "TREINO · FÁCIL",         description: "vs CPU lenta, sem twists",                   mode: "training", difficulty: "easy" },
  { label: "TREINO · NORMAL",        description: "vs CPU padrão",                              mode: "training", difficulty: "normal" },
  { label: "TREINO · DIFÍCIL",       description: "vs CPU rápida com pouca margem de erro",     mode: "training", difficulty: "hard" },
];

export class MenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private optionDescTexts: Phaser.GameObjects.Text[] = [];
  private campaignPhase = 1;

  private keys!: Record<
    "UP" | "DOWN" | "W" | "S" | "ENTER" | "SPACE" | "K",
    Phaser.Input.Keyboard.Key
  >;

  constructor() {
    super("menu");
  }

  create() {
    this.campaignPhase = this.loadCampaignPhase();

    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, COLOR_HEX.bg);
    drawDiagonalScanlines(this, this.scale.width, this.scale.height, 15, 0.045);

    addCornerLabel(this, 22, 22, "/ 02", "PONG", false);
    createPulsingDot(this, this.scale.width - 22 - 4, 22 + 6, 4, COLOR_HEX.accent);
    this.add
      .text(this.scale.width - 38, 22, `CAMPANHA · FASE ${String(this.campaignPhase).padStart(2, "0")} / 05`, TEXT_PRESETS.monoLabel)
      .setOrigin(1, 0);

    this.add.text(22, this.scale.height - 22, "GAMEDEV.02", TEXT_PRESETS.hint).setOrigin(0, 1);
    this.add.text(this.scale.width - 22, this.scale.height - 22, "BRICOLAGE · GEIST", TEXT_PRESETS.hint).setOrigin(1, 1);

    this.add
      .text(this.scale.width / 2, 110, "/ JORNADA GAMEDEV", { ...TEXT_PRESETS.monoLabel, color: COLORS.muted })
      .setOrigin(0.5);

    this.add
      .text(this.scale.width / 2, 168, "PONG", TEXT_PRESETS.heroOutline)
      .setOrigin(0.5)
      .setFontSize("96px");

    this.add
      .text(this.scale.width / 2, 232, "rebata, mire, leve o ponto", TEXT_PRESETS.body)
      .setOrigin(0.5);

    OPTIONS.forEach((opt, i) => {
      const y = 295 + i * 52;
      const labelText = this.add
        .text(this.scale.width / 2, y, opt.label, { ...TEXT_PRESETS.bodyFg, fontSize: "19px" })
        .setOrigin(0.5);
      this.optionTexts.push(labelText);

      const descText = this.add
        .text(this.scale.width / 2, y + 18, opt.description, { ...TEXT_PRESETS.hint, color: COLORS.muted })
        .setOrigin(0.5);
      this.optionDescTexts.push(descText);

      const hitArea = this.add.rectangle(this.scale.width / 2, y + 9, 600, 46, 0, 0).setInteractive({ useHandCursor: true });
      hitArea.on("pointerover", () => { this.selectedIndex = i; this.refreshHighlight(); });
      hitArea.on("pointerdown", () => { this.selectedIndex = i; this.refreshHighlight(); this.startSelected(); });
    });

    this.add
      .text(this.scale.width / 2, this.scale.height - 56, isTouchDevice()
        ? "TOQUE UMA OPÇÃO PRA JOGAR"
        : "↑ ↓ ESCOLHER  ·  ENTER JOGAR  ·  K SCREENSHOT", TEXT_PRESETS.hint)
      .setOrigin(0.5);

    const kb = this.input.keyboard!;
    this.keys = {
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      ENTER: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      K: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
    };
    kb.on("keydown", unlockAudio);

    this.refreshHighlight();
  }

  update() {
    const justDown = Phaser.Input.Keyboard.JustDown;

    if (justDown(this.keys.K)) {
      takeScreenshot(this.game, "gamedev-02-pong-menu");
    }

    if (justDown(this.keys.UP) || justDown(this.keys.W)) {
      this.selectedIndex = (this.selectedIndex - 1 + OPTIONS.length) % OPTIONS.length;
      this.refreshHighlight();
    } else if (justDown(this.keys.DOWN) || justDown(this.keys.S)) {
      this.selectedIndex = (this.selectedIndex + 1) % OPTIONS.length;
      this.refreshHighlight();
    } else if (justDown(this.keys.ENTER) || justDown(this.keys.SPACE)) {
      this.startSelected();
    }
  }

  private startSelected() {
    const opt = OPTIONS[this.selectedIndex];
    this.scene.start("pong", {
      mode: opt.mode,
      difficulty: opt.difficulty,
      phase: opt.mode === "campaign" ? this.campaignPhase : 1,
    });
  }

  private refreshHighlight() {
    this.optionTexts.forEach((text, i) => {
      const isSelected = i === this.selectedIndex;
      text.setColor(isSelected ? COLORS.accent : COLORS.fg);
      text.setText(`${isSelected ? "▸  " : "    "}${OPTIONS[i].label}`);
    });
    this.optionDescTexts.forEach((text, i) => {
      const isSelected = i === this.selectedIndex;
      text.setColor(isSelected ? COLORS.fg : COLORS.muted);
    });
  }

  private loadCampaignPhase(): number {
    try {
      const raw = localStorage.getItem(CAMPAIGN_PHASE_KEY);
      const n = raw ? parseInt(raw, 10) : 1;
      return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1;
    } catch {
      return 1;
    }
  }
}

export { CAMPAIGN_PHASE_KEY };

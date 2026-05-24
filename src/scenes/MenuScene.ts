import Phaser from "phaser";

const WIDTH = 800;
const HEIGHT = 600;

export type GameMode = "single" | "multi";

type MenuOption = { label: string; mode: GameMode };

const OPTIONS: MenuOption[] = [
  { label: "1 Jogador  (vs Computador)", mode: "single" },
  { label: "2 Jogadores  (Local)", mode: "multi" },
];

export class MenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private keys!: {
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    W: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    ENTER: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("menu");
  }

  create() {
    for (let y = 10; y < HEIGHT; y += 20) {
      this.add.rectangle(WIDTH / 2, y, 2, 10, 0x1e293b);
    }

    this.add
      .text(WIDTH / 2, 130, "PONG", {
        fontFamily: "monospace",
        fontSize: "112px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.add
      .text(WIDTH / 2, 215, "uma jornada em game dev", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#475569",
      })
      .setOrigin(0.5);

    OPTIONS.forEach((opt, i) => {
      const text = this.add
        .text(WIDTH / 2, 320 + i * 56, opt.label, {
          fontFamily: "monospace",
          fontSize: "22px",
          color: "#64748b",
        })
        .setOrigin(0.5);
      this.optionTexts.push(text);
    });

    this.add
      .text(WIDTH / 2, HEIGHT - 50, "↑/↓ ou W/S para escolher    ENTER ou ESPAÇO para jogar", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#475569",
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard!;
    this.keys = {
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      ENTER: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };

    this.refreshHighlight();
  }

  update() {
    const justDown = Phaser.Input.Keyboard.JustDown;

    if (justDown(this.keys.UP) || justDown(this.keys.W)) {
      this.selectedIndex = (this.selectedIndex - 1 + OPTIONS.length) % OPTIONS.length;
      this.refreshHighlight();
    } else if (justDown(this.keys.DOWN) || justDown(this.keys.S)) {
      this.selectedIndex = (this.selectedIndex + 1) % OPTIONS.length;
      this.refreshHighlight();
    } else if (justDown(this.keys.ENTER) || justDown(this.keys.SPACE)) {
      this.scene.start("pong", { mode: OPTIONS[this.selectedIndex].mode });
    }
  }

  private refreshHighlight() {
    this.optionTexts.forEach((text, i) => {
      const isSelected = i === this.selectedIndex;
      text.setColor(isSelected ? "#ffffff" : "#64748b");
      text.setText(`${isSelected ? "▶  " : "    "}${OPTIONS[i].label}`);
    });
  }
}

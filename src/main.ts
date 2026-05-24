import Phaser from "phaser";
import { MenuScene } from "./scenes/MenuScene";
import { PongScene } from "./scenes/PongScene";
import { COLORS, FONT_NAMES } from "./theme";

async function bootstrap() {
  try {
    await Promise.all([
      document.fonts.load(`16px "${FONT_NAMES.mono}"`),
      document.fonts.load(`64px "${FONT_NAMES.display}"`),
    ]);
  } catch {
    // sem rede — segue com fontes do sistema
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: COLORS.bg,
    parent: "game",
    scene: [MenuScene, PongScene],
  });
}

void bootstrap();

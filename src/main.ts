import Phaser from "phaser";
import { MenuScene } from "./scenes/MenuScene";
import { PongScene } from "./scenes/PongScene";

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#0f172a",
  parent: "game",
  scene: [MenuScene, PongScene],
});

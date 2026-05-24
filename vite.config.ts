import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/gamedev-02-pong/" : "/",
  server: { port: 5174, open: true },
  build: { target: "es2020" },
}));

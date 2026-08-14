import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const configuredPort = process.env.EARTH_STORIES_PORT;
const localServicePort =
  configuredPort === undefined ? 4317 : Number(configuredPort);
if (
  !Number.isInteger(localServicePort) ||
  localServicePort < 1 ||
  localServicePort > 65_535
)
  throw new Error("EARTH_STORIES_PORT must be an integer between 1 and 65535");

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  server: {
    port: 5173,
    proxy: {
      "/api": `http://127.0.0.1:${localServicePort}`,
    },
  },
  build: {
    outDir: "../../dist/editor",
    emptyOutDir: true,
    manifest: true,
  },
});

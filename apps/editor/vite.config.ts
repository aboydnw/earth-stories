import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const localServicePort = Number(process.env.EARTH_STORIES_PORT ?? 4317);

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  server: {
    port: 5173,
    proxy: {
      "/api": `http://127.0.0.1:${localServicePort}`,
    },
  },
  build: { outDir: "../../dist/editor", emptyOutDir: true },
});

import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    outDir: "build",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        corpus: fileURLToPath(new URL("corpus/index.html", import.meta.url)),
      },
    },
  },
  worker: { format: "es" },
});

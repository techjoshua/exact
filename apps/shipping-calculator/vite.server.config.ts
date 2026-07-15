import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "node22",
    outDir: "dist/server",
    emptyOutDir: true,
    ssr: "src/start.ts",
    rollupOptions: { output: { entryFileNames: "start.js" } }
  }
});

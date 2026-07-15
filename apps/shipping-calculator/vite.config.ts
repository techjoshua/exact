import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: "src/client.ts" }
  }
});

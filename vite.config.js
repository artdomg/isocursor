import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  server: {
    port: 4242,
    strictPort: true,
  },
  preview: {
    port: 4242,
    host: true,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
  },
});

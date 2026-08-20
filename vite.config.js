import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 4242,
    strictPort: true,
  },
  preview: {
    port: 4242,
    host: true,
    strictPort: true,
  },
});

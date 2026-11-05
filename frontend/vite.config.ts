/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BACKEND = process.env.MOCKDOCK_BACKEND_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // The UI talks to the backend through same-origin paths in development.
    proxy: {
      "/api": { target: BACKEND, changeOrigin: false },
      "/mock": { target: BACKEND, changeOrigin: false },
    },
  },
  preview: { host: "127.0.0.1", port: 4173 },
  build: {
    chunkSizeWarningLimit: 4000,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});

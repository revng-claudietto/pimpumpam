import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API base defaults to same-origin (when FastAPI serves the built UI). In dev
// the proxy below forwards the API route groups to the local Python server, so
// no CORS is needed. For Electron, set VITE_API_BASE to the spawned API origin.
const API_TARGET = process.env.PIMPUMPAM_API ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  // Relative base so the build also loads over file:// inside Electron.
  base: "./",
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ["/accounts", "/health", "/openapi.json"].map((p) => [
        p,
        { target: API_TARGET, changeOrigin: true },
      ]),
    ),
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Backend URL for the dev-server proxy (compose sets it to http://backend:8000).
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8000";
  return {
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: { output: { manualChunks: { maplibre: ["maplibre-gl"] } } },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/ws": { target: apiTarget, ws: true, changeOrigin: true },
      },
    },
  };
});

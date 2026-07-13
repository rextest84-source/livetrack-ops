import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "path";

const port = Number(process.env.PORT ?? "5173");
const basePath = process.env.BASE_PATH ?? "/";
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:5000";
const cesiumSource = path.resolve(
  import.meta.dirname,
  "node_modules/cesium/Build/Cesium",
);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

export default defineConfig({
  base: basePath,
  define: {
    CESIUM_BASE_URL: JSON.stringify(`${basePath.replace(/\/$/, "")}/cesium`),
  },
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/Assets`, dest: "cesium/Assets" },
        { src: `${cesiumSource}/ThirdParty`, dest: "cesium/ThirdParty" },
        { src: `${cesiumSource}/Workers`, dest: "cesium/Workers" },
        { src: `${cesiumSource}/Widgets`, dest: "cesium/Widgets" },
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
  },
  optimizeDeps: {
    exclude: ["cesium"],
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});

import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/* Builds the React islands into static files the plain-HTML portal loads:
   assets/react/portal.js (ES module) + portal.css */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  publicDir: false,
  build: {
    outDir: "assets/react",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "src/main.tsx"),
      output: {
        entryFileNames: "portal.js",
        chunkFileNames: "portal-[name].js",
        assetFileNames: "portal.[ext]",
      },
    },
  },
});

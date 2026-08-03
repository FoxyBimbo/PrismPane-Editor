// ============================================================
// PrismPane — Vite Configuration
// ============================================================

import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss()],

  // Prevent vite from obscuring Rust errors
  clearScreen: false,

  // Tauri expects a fixed port; fail if that port is not available
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  // Env variables starting with TAURI_ will be exposed to the frontend
  envPrefix: ["VITE_", "TAURI_"],

  build: {
    // Tauri uses Chromium (WebView2) on Windows and WebKit on macOS/Linux
    // Use modern browser targets that support dynamic import destructuring
    target: "es2021",
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Silence chunk-size warnings
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
      output: {
        codeSplitting: true,
        // Extract shared vendors into dedicated chunks
        manualChunks: (id: string) => {
          if (id.includes('node_modules/@codemirror')) {
            return 'codemirror';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
          if (id.includes('node_modules/@lezer')) {
            return 'lezer';
          }
          if (id.includes('node_modules/@tauri-apps')) {
            return 'tauri';
          }
          if (id.includes('node_modules/marked')) {
            return 'marked';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }
        },
      },
    },
  },
});
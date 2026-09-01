import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The location dataset (574 areas, ~85KB) is imported from many
        // separate lazy-loaded chunks (App, ReportForm, NearbyPanel, Filters,
        // OutagePatterns, Ticker, ReportCard, Splash, LedgerTable, MapView).
        // Rollup's default chunking merges a module shared by several async
        // entry points into the main synchronous entry chunk — meaning every
        // visitor, including ones who never leave the in-app-browser gate,
        // downloaded and parsed this dataset before React even mounted. Forcing
        // it into its own chunk keeps it out of the entry and lets it load
        // only alongside whichever feature actually needs it.
        manualChunks(id) {
          if (id.includes("data/locations.json") || id.includes("src/data/locations.ts")) {
            return "locations";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies /api/* to the small Express-less Node server (server.js)
// running on port 8787. This keeps your Gemini API key OFF the client.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});

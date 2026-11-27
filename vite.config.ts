import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 院内端末（Windows PC の Chrome/Edge、iPad の Safari）向けの単一ページアプリ。
// ビルド成果物は Firebase Hosting の dist/ に配信する。
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    port: 5173,
  },
});

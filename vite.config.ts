import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 院内端末（Windows PC の Chrome/Edge、iPad の Safari）向けの単一ページアプリ。
// ビルド成果物は Firebase Hosting の dist/ に配信する。
// tailwindcss は試用版から移植した画面（Tailwind ユーティリティ + theme.css）用。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
  },
  server: {
    port: 5173,
  },
});

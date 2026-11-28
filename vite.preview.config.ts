// 確認用プレビュー（ログイン・Firebase なしで全画面を開く）用の設定。
// 使い方: npm run preview:ui → http://localhost:5199/preview.html
// データ層（src/api.ts）と認証（src/auth/AuthGate.tsx）を、src/preview/ の
// スタブに差し替える。本番ビルド（vite.config.ts）には一切影響しない。
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = __dirname;
const swaps: Record<string, string> = {
  [path.join(root, "src/api.ts")]: path.join(root, "src/preview/mockApi.ts"),
  [path.join(root, "src/auth/AuthGate.tsx")]: path.join(root, "src/preview/mockAuth.tsx"),
};

function swapForPreview(): Plugin {
  return {
    name: "swap-for-preview",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!importer) return null;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (!resolved) return null;
      const target = swaps[resolved.id.split("?")[0]];
      return target ?? null;
    },
  };
}

export default defineConfig({
  plugins: [swapForPreview(), react(), tailwindcss()],
  server: { port: 5199, strictPort: true },
});

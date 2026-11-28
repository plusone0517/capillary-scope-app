// 確認用プレビューの入口（本番の入口は src/main.tsx）。
import React from "react";
import ReactDOM from "react-dom/client";
import "../styles.css";
import "../theme.css";
import { HomePage } from "../pages/HomePage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HomePage />
  </React.StrictMode>,
);

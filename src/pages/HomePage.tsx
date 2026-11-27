// アプリ本体の枠（ログイン後の画面）。
// ヘッダー（スタッフ表示・ログアウト）の下に、試用版（Space）から移植した
// 観察・レポート画面一式（CapillaryApp）を表示する。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth, logout } from "../auth/AuthGate";
import { CapillaryApp } from "../CapillaryApp";

const queryClient = new QueryClient();

export function HomePage() {
  const authState = useAuth();
  const staff = authState.status === "ready" ? authState.staff : null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>毛細血管 分析アプリ</h1>
        <div className="header-user">
          <span>{staff?.displayName ?? ""}（{staff?.email ?? ""}）</span>
          <button type="button" className="secondary-button" onClick={() => void logout()}>
            ログアウト
          </button>
        </div>
      </header>

      <QueryClientProvider client={queryClient}>
        <CapillaryApp />
      </QueryClientProvider>
    </div>
  );
}

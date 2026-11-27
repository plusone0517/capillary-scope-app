// アプリの入口。認証ガードを通った場合だけ本体（HomePage）を描画する。
import { AuthProvider, useAuth, logout } from "./auth/AuthGate";
import { LoginScreen } from "./auth/LoginScreen";
import { HomePage } from "./pages/HomePage";
import { LoadingState } from "./States";

function Gate() {
  const authState = useAuth();

  switch (authState.status) {
    case "loading":
      return (
        <main className="center-screen">
          <LoadingState label="読み込み中…" />
        </main>
      );
    case "signedOut":
      return <LoginScreen />;
    case "noStaffRecord":
    case "inactiveStaff":
      return (
        <main className="center-screen">
          <div className="notice-card">
            <h1>スタッフ登録がありません</h1>
            <p>
              このアカウントは分析アプリのスタッフとして登録されていないため、
              アプリを使うことができません。管理者に登録を依頼してください。
            </p>
            <button type="button" className="secondary-button" onClick={() => void logout()}>
              ログアウト
            </button>
          </div>
        </main>
      );
    case "ready":
      return <HomePage />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

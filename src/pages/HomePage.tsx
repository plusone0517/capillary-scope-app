// アプリ本体の枠（ログイン後の画面）。
// 段階1の土台として、観察の一覧プレースホルダとパターン定義の確認表示を持つ。
// 撮影・所見入力・レポート・ビフォアアフター・試験モードの各画面は
// この枠の中に順次実装していく（試用版 Space の機能を移植する）。
import { useAuth, logout } from "../auth/AuthGate";
import { capillaryPatterns } from "../data/capillary-patterns";

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

      <main className="app-main">
        <section className="panel">
          <h2>観察の記録</h2>
          <p>
            撮影と所見の入力、レポート表示、ビフォアアフター比較、試験モードの画面は
            ここに実装していきます（土台のみ作成済み）。
          </p>
          <div className="action-row">
            <button type="button" className="primary-button" disabled>
              新しい観察を記録する（実装予定）
            </button>
            <button type="button" className="secondary-button" disabled>
              観察の一覧（実装予定）
            </button>
            <button type="button" className="secondary-button" disabled>
              試験データの書き出し（実装予定）
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>形のパターン（20種）</h2>
          <p>
            パターンは「最も近い形」として複数選択で記録します。下記は移植済みの定義で、
            観察入力画面の選択肢とレポートの照合カードに使います。
          </p>
          <ul className="pattern-list">
            {capillaryPatterns.map((pattern) => (
              <li key={pattern.code}>
                <strong>{pattern.name}</strong>
                {pattern.clinical && <span className="clinical-badge">受診案内の対象</span>}
                <span className="pattern-feature">{pattern.feature}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

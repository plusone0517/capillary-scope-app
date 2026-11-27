// スタッフログイン画面（Firebase Auth メール / パスワード）。
import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { LogoMark } from "../Logo";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // 成功後は AuthProvider 側の状態変化で本体へ切り替わる。
    } catch {
      setError("ログインできませんでした。メールアドレスとパスワードを確認してください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="flex justify-center pb-1 pt-1">
          <LogoMark size={84} />
        </div>
        <p className="login-brand text-center">メディプロ医薬 開発</p>
        <h1>
          毛細血管
          <br />
          観察・記録システム
        </h1>
        <p className="login-note">院内スタッフ専用です。ログインして使ってください。</p>
        <label>
          メールアドレス
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          パスワード
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? "ログイン中…" : "ログイン"}
        </button>
      </form>
    </main>
  );
}

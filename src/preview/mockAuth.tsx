// 確認用プレビュー専用の認証スタブ。本番ビルドには含まれない
// （vite.preview.config.ts のときだけ auth/AuthGate の代わりに読み込まれる）。
import type { ReactNode } from "react";
import type { Staff } from "../types/models";

const staff = {
  uid: "preview-staff",
  email: "staff@example.com",
  displayName: "確認用スタッフ",
  role: "admin",
  active: true,
} as unknown as Staff;

const state = { status: "ready" as const, user: { uid: "preview-staff" }, staff };

export function useAuth() {
  return state as unknown as ReturnType<typeof import("../auth/AuthGate").useAuth>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export async function logout(): Promise<void> {}

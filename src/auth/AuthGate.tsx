// ログイン状態とスタッフ登録を管理するコンテキスト。
//
// ガードの方針:
// - 未ログイン → ログイン画面だけを出す（アプリ本体は描画しない）。
// - ログイン済みでも staff/{uid} が無い、または active でない場合は
//   「スタッフ登録がありません」の画面だけを出す（アプリ本体は描画しない）。
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import type { Staff } from "../types/models";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "noStaffRecord"; user: User }
  | { status: "inactiveStaff"; user: User; staff: Staff }
  | { status: "ready"; user: User; staff: Staff };

const AuthContext = createContext<AuthState>({ status: "loading" });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ status: "signedOut" });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "staff", user.uid));
        if (!snap.exists()) {
          setState({ status: "noStaffRecord", user });
          return;
        }
        const staff = { uid: snap.id, ...snap.data() } as Staff;
        if (!staff.active) {
          setState({ status: "inactiveStaff", user, staff });
          return;
        }
        setState({ status: "ready", user, staff });
      } catch {
        // staff ドキュメントを読めない場合も本体は出さない。
        setState({ status: "noStaffRecord", user });
      }
    });
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

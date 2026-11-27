# 毛細血管 分析アプリ（院内用・本番版の土台）

爪郭部毛細血管スコープ（3R Solution 血流ドクターオート）で撮影した観察を
記録し、レポートを作成するための院内向け Web アプリです。

- 開発: メディプロ医薬
- 納品先: ルーツオブライフ（ルーツマイル運営）
- 利用環境: 院内 PC（Windows の Chrome / Edge）、iPad（Safari）
- このアプリは「観察の記録と生活アドバイス」を扱います。診断や予測のためのものではありません。

このリポジトリは**本番版の土台（スキャフォールド）**です。
土台の範囲: ログインとスタッフ確認のガード、データモデル、セキュリティルール、
受け取りトークン発行・検証の Functions 雛形、20種の形パターン定義。
撮影・所見入力・レポート・ビフォアアフター・試験モードの画面は、
試用版（Space）で固めた仕様をこの土台へ順次移植していきます。

## デプロイ

main ブランチへの push で GitHub Actions が自動デプロイします（Hosting / Firestore ルール / Storage ルール）。
公開 URL: https://medipro-capillary-scope.web.app

## アーキテクチャ概要

新規の独立した Firebase プロジェクトとして構築します
（`.firebaserc` のプロジェクトIDは `medipro-capillary-scope`。
実際のプロジェクトを作成したら置き換えてください）。

| 構成要素 | 役割 |
|---|---|
| Firebase Hosting | Web アプリ（Vite + React + TypeScript）の配信 |
| Firebase Authentication | スタッフのログイン（メール / パスワード） |
| Cloud Firestore | 対象者・観察・レポート・クレーム・監査ログ |
| Cloud Storage | 観察画像（静止画）と動画。公開URLは発行せず、認証つき取得のみ |
| Cloud Functions | 受け取りトークンの発行（`issueClaimToken`）と検証・消費（`verifyAndConsumeClaim`） |

### データモデル（`src/types/models.ts`）

- `staff/{uid}` — スタッフ。Auth の uid と一致。`active: true` でないとアプリ本体は使えない
- `patients/{patientId}` — 対象者（院内ID `patientCode` を持つ）
- `observations/{id}` — 観察記録。撮影条件、密度、流れ・色の印象、形パターン（複数選択）、
  臨床フラグ4種、画像・動画参照、血流速度の参考値、試験モードの項目
  （試験名・群・実施内容の配列）を含む
- `reports/{reportId}` — 確定レポート。表示内容は観察データから都度組み立てる
- `claims/{claimId}` — 受け取りQR用。トークンは SHA-256 ハッシュだけを保存し、
  有効期限つき・取り込み1回限り（二重取り込み防止は Functions のトランザクションが正）
- `auditLogs/{logId}` — 誰がいつ何をしたかの記録

### ルーツマイルへの受け渡し

レポート確定後に受け取りQR（reportId + 推測不能トークン）を発行し、
会員本人がルーツマイルで読み取って自分の記録へ取り込む「引き取り方式」です。
設計の詳細とプロジェクト間連携の前提は次を参照してください。

- 設計書: `~/workspace/goals/roots-mile-app-completion/files/capillary-analysis-app-sharing-design-2026-11-27.md`
- Functions 内の設計メモ: `functions/src/index.ts` の冒頭コメント
- 撮影と記録の型: `~/workspace/goals/roots-mile-app-completion/files/capillary-shooting-record-protocol-2026-11-27.md`
- 形パターン定義（移植済み）: `src/data/capillary-patterns.ts`

## セットアップ手順

前提: Node.js 20 以上、Firebase CLI（`npm install -g firebase-tools`）。

```bash
# 1. 依存パッケージ
npm install
cd functions && npm install && cd ..

# 2. 環境変数
cp .env.example .env.local
# .env.local に Firebase コンソールの Web アプリ設定を入れる（実値はコミットしない）

# 3. 開発サーバー
npm run dev

# 4. ローカルで Firebase ごと確認する場合（別ターミナル）
npm run emulators
```

## Firebase プロジェクト作成後にやること

1. **プロジェクト作成** — Firebase コンソールで新規プロジェクトを作成し、
   `.firebaserc` の `medipro-capillary-scope` を実際のプロジェクトIDに置き換える。
   リージョンは東京（asia-northeast1）を想定。
2. **Web アプリ登録** — プロジェクトに Web アプリを追加し、発行された設定値を
   `.env.local` に転記する（`.env.example` の項目に対応）。
3. **Authentication 有効化** — ログイン方法で「メール / パスワード」を有効にする。
   スタッフのアカウントはコンソール（または管理用スクリプト）で発行する。
   パスワードをチャットやメール本文でやり取りしない。
4. **スタッフ登録** — Firestore の `staff/{uid}` に、Auth で発行した uid と同じ
   ドキュメントIDで `{ email, displayName, role, active: true }` を作成する。
   これがないアカウントはログインできてもアプリ本体は使えない。
5. **Firestore / Storage の作成** — コンソールでデータベースとバケットを作成する
   （ルールはこのリポジトリのものをデプロイするので、初期ルールはそのままでよい）。
6. **プラン確認** — Cloud Functions（第2世代）を使うため、プロジェクトは
   Blaze（従量課金）プランが必要。
7. **デプロイ**:
   ```bash
   npm run build
   firebase deploy            # Hosting + Firestore + Storage + Functions を一括
   # 個別: npm run deploy:hosting / deploy:rules / deploy:functions
   ```
8. **動作確認** — スタッフでログインできること、未登録アカウントで本体が出ないこと、
   ルールが効いていること（エミュレータでの事前確認を推奨）。

## 残っている作業（土台の範囲外）

- 画面の移植: カメラ接続・撮影、所見入力（パターン選択は図つき）、
  レポート表示・印刷、受け取りQRの表示、観察の一覧・検索・編集
- ビフォアアフター比較（2件並列表示、密度・血流速度の差分、同時再生）
- 血流速度の試作計測（時空間画像法）の移植
- 試験モードの入力画面と、試験データの CSV 書き出し
- 院内実機テスト: 院内 PC と USB-C iPad でスコープ（3R-DRAUTO）が
  カメラとして選べるか、実動画で速度計測が通るか
- 段階2: ルーツマイル側のQR取り込み口（別リポジトリ側の作業）
- 未決事項の確定: パターン別アドバイス文面（20種分）、受け取りQRの有効期限、
  院内側の原本保管期間、非会員の来院者への扱い

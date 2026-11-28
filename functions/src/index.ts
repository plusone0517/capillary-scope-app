// 毛細血管分析アプリ Cloud Functions
//
// 役割は「受け取りトークン（クレーム）」の発行と検証だけに絞る。
// 観察データの読み書きはクライアント SDK + セキュリティルールで行う。
//
// ────────────────────────────────────────────────────────────────
// ルーツマイル側とのプロジェクト間連携について
//
// このアプリは独立した Firebase プロジェクト（medipro-capillary-scope）で動く。
// ルーツマイルは別プロジェクトのため、取り込み時の検証は次の方式で連携する:
//
// 1. ルーツマイル側の Cloud Functions が、会員本人の操作をトリガーに、
// このプロジェクトの verifyAndConsumeClaim をサーバー間（server-to-server）で呼ぶ。
// 呼び出し元の認証は、ルーツ側 Functions のサービスアカウントに
// このプロジェクト側で Cloud Run Invoker 権限を付与して行う
// （エンドユーザー向けの公開 API にはしない）。
// 2. 検証が成功したら、この関数はクレームを使用済みにし（1回限り）、
// レポートの観察データを「取り込み用ペイロード」として返す。
// ルーツ側は受け取ったデータを会員本人の healthRecords へ
// capillary 記録としてコピー保存し、画像も会員本人の Storage 領域へ
// コピーする（コピー方式。院内側の原本を後で整理しても会員の記録は壊れない）。
// 3. 二重取り込み防止は、このプロジェクト側の claims.usedAt を正とする。
// 検証と使用済み化は同一トランザクションで行い、同時リクエストでも
// 2回成功しないようにする。ルーツ側にも reportId の取り込み済み記録を
// 残し、二重の防御とする。
// 4. QR の中身は reportId とトークンだけ。健康データそのものは QR に入れない。
// トークンはこのプロジェクトにもハッシュ（SHA-256）しか保存しない。
//
// ※ 将来、同一プロジェクト内へ統合する判断があった場合は、
// verifyAndConsumeClaim の内部処理（トランザクション部分）を
// そのままルーツ側 Functions へ移せるよう、検証ロジックは
// プロジェクト固有の前提に依存させていない。
// ────────────────────────────────────────────────────────────────

import { initializeApp} from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import { onCall, HttpsError} from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { createHash, randomBytes} from "node:crypto";
import { PATTERN_SUMMARIES, PATTERN_CODE_SET } from "./patterns";

initializeApp();

const REGION = "asia-northeast1";
/** 受け取りトークンの有効期限（日）。設計書の目安は90日。最終決定は未決事項。 */
const CLAIM_TTL_DAYS = 90;

function hashToken(token: string): string {
return createHash("sha256").update(token, "utf8").digest("hex");
}

async function requireActiveStaff(uid: string | undefined): Promise<void> {
if (!uid) {
throw new HttpsError("unauthenticated", "ログインが必要です。");
}
const snap = await getFirestore().doc(`staff/${uid}`).get();
if (!snap.exists || snap.data()?.active!== true) {
throw new HttpsError("permission-denied", "スタッフ登録がありません。");
}
}

interface IssueClaimRequest {
reportId: string;
}

/**
* 受け取りトークンの発行（スタッフのみ）。
* - レポートに未使用のクレームが既にある場合は失効させてから再発行する。
* - 戻り値の token はこの1回だけ平文で返る。QR はこの値で生成し、
* サーバー側にはハッシュしか残らない。
*/
export const issueClaimToken = onCall<IssueClaimRequest>(
{ region: REGION},
async (request) => {
await requireActiveStaff(request.auth?.uid);

const reportId = request.data?.reportId;
if (typeof reportId!== "string" || reportId.length === 0) {
throw new HttpsError("invalid-argument", "reportId が必要です。");
}

const db = getFirestore();
const reportRef = db.doc(`reports/${reportId}`);
const reportSnap = await reportRef.get();
if (!reportSnap.exists) {
throw new HttpsError("not-found", "レポートが見つかりません。");
}

const token = randomBytes(32).toString("base64url");
const now = Timestamp.now();
const expiresAt = Timestamp.fromMillis(
now.toMillis() + CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000,
);

const claimRef = await db.runTransaction(async (tx) => {
// 既存の未使用クレームは失効させる（1レポートにつき有効なQRは1つだけ）。
const existing = await tx.get(
db.collection("claims").where("reportId", "==", reportId),
);
for (const doc of existing.docs) {
const data = doc.data();
if (!data.usedAt &&!data.revoked) {
tx.update(doc.ref, { revoked: true});
}
}
const newClaimRef = db.collection("claims").doc();
tx.set(newClaimRef, {
reportId,
tokenHash: hashToken(token),
expiresAt,
usedAt: null,
usedByMemberId: null,
revoked: false,
issuedBy: request.auth!.uid,
createdAt: FieldValue.serverTimestamp(),
});
tx.update(reportRef, {
claimId: newClaimRef.id,
updatedAt: FieldValue.serverTimestamp(),
});
return newClaimRef;
});

await db.collection("auditLogs").add({
actorUid: request.auth!.uid,
action: "claim.issue",
targetType: "claim",
targetId: claimRef.id,
at: FieldValue.serverTimestamp(),
detail: `reportId=${reportId}`,
});

return {
claimId: claimRef.id,
token,
expiresAt: expiresAt.toDate().toISOString(),
};
},
);

interface VerifyClaimRequest {
reportId: string;
token: string;
/** 取り込むルーツマイル会員ID（ルーツ側 Functions が会員認証を済ませた上で渡す）。 */
memberId: string;
}

/**
* 受け取りトークンの検証と消費（取り込み）。
* - ルーツマイル側 Functions からサーバー間で呼ばれる想定（設計メモ参照）。
* そのため callable の認証チェックは「呼び出し元がスタッフ」ではなく、
* デプロイ側の IAM（Cloud Run Invoker）で制限する前提とし、
* ここでは memberId の提示を必須にしている。
* - 検証（ハッシュ一致・期限内・未使用・未失効）と使用済み化を
* 同一トランザクションで行い、二重取り込みを防ぐ。
* - 成功時は、ルーツ側が会員の記録へコピーするための観察データを返す。
*/
export const verifyAndConsumeClaim = onCall<VerifyClaimRequest>(
{ region: REGION},
async (request) => {
const { reportId, token, memberId} = request.data?? {};
if (
typeof reportId!== "string" ||
typeof token!== "string" ||
typeof memberId!== "string" ||
memberId.length === 0
) {
throw new HttpsError(
"invalid-argument",
"reportId / token / memberId が必要です。",
);
}

const db = getFirestore();
const tokenHash = hashToken(token);

const payload = await db.runTransaction(async (tx) => {
const claimsSnap = await tx.get(
db
.collection("claims")
.where("reportId", "==", reportId)
.where("tokenHash", "==", tokenHash)
.limit(1),
);
if (claimsSnap.empty) {
throw new HttpsError("not-found", "受け取り情報が見つかりません。");
}
const claimDoc = claimsSnap.docs[0];
const claim = claimDoc.data();

if (claim.revoked) {
throw new HttpsError("failed-precondition", "このQRは無効化されています。");
}
if (claim.usedAt) {
throw new HttpsError("already-exists", "取り込み済みです。");
}
if ((claim.expiresAt as Timestamp).toMillis() < Date.now()) {
throw new HttpsError("deadline-exceeded", "有効期限が切れています。");
}

const reportRef = db.doc(`reports/${reportId}`);
const reportSnap = await tx.get(reportRef);
if (!reportSnap.exists) {
throw new HttpsError("not-found", "レポートが見つかりません。");
}
const report = reportSnap.data()!;

const observationSnap = await tx.get(
db.doc(`observations/${report.observationId}`),
);
if (!observationSnap.exists) {
throw new HttpsError("not-found", "観察データが見つかりません。");
}

// 使用済み化（1回限り）。この更新が二重取り込み防止の正になる。
tx.update(claimDoc.ref, {
usedAt: FieldValue.serverTimestamp(),
usedByMemberId: memberId,
});

return {
claimId: claimDoc.id,
report: { id: reportSnap.id,...report},
observation: { id: observationSnap.id,...observationSnap.data()},
};
});

await db.collection("auditLogs").add({
actorUid: "roots-mile-functions",
action: "claim.consume",
targetType: "claim",
targetId: payload.claimId,
at: FieldValue.serverTimestamp(),
detail: `memberId=${memberId} reportId=${reportId}`,
});

// 画像・動画は Storage パス（observations の images/videos）だけを返す。
// 実ファイルのコピーは、ルーツ側 Functions がこのプロジェクトの
// バケットから読み取り、会員本人の領域へ書き込む（バケット間コピー）。
return payload;
},
);

/* ================= AIによるパターン候補の提示（試作） ================= */

/**
 * OpenAI API キー（Secret Manager）。デプロイ時に
 * `firebase functions:secrets:set OPENAI_API_KEY` で設定する。
 * 未設定のときは analyzeImagePatterns が { configured: false } を返す
 * （呼び出し自体は失敗させない）。
 */
const openAiApiKey = defineSecret("OPENAI_API_KEY");

/** 画像 base64 の上限（文字数）。約6MBの画像に相当する。 */
const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024;
/** 候補の最大件数。 */
const MAX_CANDIDATES = 4;
/** 理由文の最大文字数（応答が長くなりすぎた場合の切り捨て）。 */
const MAX_REASON_LENGTH = 300;

type AiConfidence = "high" | "medium" | "low";

interface AnalyzeImageRequest {
  /** 画像の base64（data URL の接頭辞なし）。 */
  imageBase64: string;
  /** 省略時は image/jpeg として扱う。 */
  mimeType?: string;
}

interface AiPatternCandidate {
  code: string;
  confidence: AiConfidence;
  reason: string;
  /**
   * その特徴が最もよく見える画像内の代表点。画像の左上を原点とする
   * パーセント座標（x: 左端0〜右端100、y: 上端0〜下端100）。
   * AIが位置を特定できない候補では null。
   */
  location: { x: number; y: number } | null;
}

interface AnalyzeImageResult {
  /** APIキーが設定済みかどうか。false のとき candidates は空。 */
  configured: boolean;
  candidates: AiPatternCandidate[];
}

function buildAnalysisPrompt(): string {
  const list = PATTERN_SUMMARIES.map(
    (p) => `- ${p.code}（${p.name}）: ${p.feature}`,
  ).join("\n");
  return [
    "次は爪郭毛細血管の観察パターンの一覧です（コード（名前）: 形の特徴）。",
    list,
    "",
    "添付した爪郭毛細血管の撮影画像を見て、この一覧の中で画像に最も近い形の候補を最大4件まで挙げてください。",
    "候補がない場合は、無理に選ばず空にしてください。",
    "各候補には、確からしさ（high / medium / low のいずれか）と、そう見える理由（画像のどこがどう見えるか）を付けてください。",
    "各候補には、その特徴が最もよく見える画像内の代表点の位置を location として付けてください。location は {\"x\": 数値, \"y\": 数値} の形で、x は画像の左端を0・右端を100、y は上端を0・下端を100とするパーセントです。位置を特定できない候補では location を null にしてください。",
    "これは診断ではありません。病名の断定や、疾患がある・ないの判断はしないでください。「最も近い形」の候補提示だけを行ってください。",
    '出力は次の形式の JSON のみとしてください: {"candidates": [{"code": "コード", "confidence": "high", "reason": "理由", "location": {"x": 50, "y": 30}}]}',
  ].join("\n");
}

/**
 * AI応答の location を検証する。{x, y} ともに有限の数値のときだけ採用し、
 * 0〜100 の範囲に収める（クランプ）。数値でない・欠けている場合は null。
 */
function parseLocation(raw: unknown): { x: number; y: number } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { x, y } = raw as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const clampPct = (v: number): number => Math.max(0, Math.min(100, v));
  return { x: clampPct(x), y: clampPct(y) };
}

/**
 * AIによるパターン候補の提示（試作）。
 * - スタッフ認証が必須（requireActiveStaff。未ログインは拒否）。
 * - 送信するのは画像だけ。氏名・ID 等の情報は入力に含めない。
 * - AI は候補を提示するだけで、選択の確定はスタッフがクライアント側で行う。
 * - APIキー未設定のときはエラーを投げず { configured: false } を返す。
 */
export const analyzeImagePatterns = onCall<
  AnalyzeImageRequest,
  Promise<AnalyzeImageResult>
>(
  { region: REGION, secrets: [openAiApiKey], timeoutSeconds: 120 },
  async (request) => {
    await requireActiveStaff(request.auth?.uid);

    const imageBase64 = request.data?.imageBase64;
    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      throw new HttpsError("invalid-argument", "画像が必要です。");
    }
    if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      throw new HttpsError("invalid-argument", "画像が大きすぎます。");
    }
    const mimeType = request.data?.mimeType ?? "image/jpeg";
    if (mimeType !== "image/jpeg" && mimeType !== "image/png") {
      throw new HttpsError(
        "invalid-argument",
        "画像の形式は JPEG か PNG にしてください。",
      );
    }

    let apiKey = "";
    try {
      apiKey = openAiApiKey.value();
    } catch {
      apiKey = "";
    }
    if (!apiKey) {
      return { configured: false, candidates: [] };
    }

    const model = process.env.OPENAI_VISION_MODEL || "gpt-6-luna";
    // 推論系モデル（gpt-5 / gpt-6 系）は Chat Completions で temperature を
    // 受け付けないため、reasoning_effort に置き換える。
    const sampling: Record<string, unknown> =
      /^gpt-[56]/.test(model) || /^o[0-9]/.test(model)
        ? { reasoning_effort: "none" }
        : { temperature: 0 };

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          // 再現性のため揺らぎを抑える（同じ画像には同じ応答が返りやすくし、
          // 誰が検査しても同じ回答に近づける）。
          ...sampling,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "あなたは爪郭毛細血管の観察を補助するアシスタントです。診断や病名の断定は行わず、決められたパターン一覧の中から「最も近い形」の候補を提示するだけです。",
            },
            {
              role: "user",
              content: [
                { type: "text", text: buildAnalysisPrompt() },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
        }),
      });
    } catch {
      throw new HttpsError(
        "internal",
        "AI解析に失敗しました。時間をおいてもう一度お試しください。",
      );
    }
    if (!response.ok) {
      throw new HttpsError(
        "internal",
        "AI解析に失敗しました。時間をおいてもう一度お試しください。",
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new HttpsError("internal", "AIの応答を読み取れませんでした。");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new HttpsError("internal", "AIの応答を読み取れませんでした。");
    }
    const rawCandidates = (parsed as { candidates?: unknown }).candidates;
    if (!Array.isArray(rawCandidates)) {
      throw new HttpsError("internal", "AIの応答を読み取れませんでした。");
    }

    // 28種の正規コードと照合し、不正なコード・重複は捨てる。
    const candidates: AiPatternCandidate[] = [];
    for (const raw of rawCandidates) {
      if (candidates.length >= MAX_CANDIDATES) break;
      if (typeof raw !== "object" || raw === null) continue;
      const { code, confidence, reason, location } = raw as Record<
        string,
        unknown
      >;
      if (typeof code !== "string" || !PATTERN_CODE_SET.has(code)) continue;
      if (candidates.some((c) => c.code === code)) continue;
      candidates.push({
        code,
        confidence:
          confidence === "high" ||
          confidence === "medium" ||
          confidence === "low"
            ? confidence
            : "low",
        reason:
          typeof reason === "string"
            ? reason.slice(0, MAX_REASON_LENGTH)
            : "",
        location: parseLocation(location),
      });
    }

    return { configured: true, candidates };
  },
);

/* ================= AIによるレポート文の下書き（試作） ================= */

/** 下書き文の最大文字数（応答が長くなりすぎた場合の切り捨て）。 */
const MAX_DRAFT_LENGTH = 1200;
/** パターンの説明文1項目あたりの最大文字数（入力検証用）。 */
const MAX_PATTERN_TEXT_LENGTH = 500;
/** 短いラベル類（指・印象・フラグ名）の最大文字数（入力検証用）。 */
const MAX_LABEL_LENGTH = 50;

interface DraftReportPatternInput {
  code: string;
  name: string;
  /** 形の特徴。 */
  feature: string;
  /** 原因。 */
  why: string;
  /** 重なりやすい症状。 */
  symptoms: string;
  /** 未病の見方。 */
  mibyo: string;
}

interface DraftReportRequest {
  /** 観察した指の表示名（例：「左手・薬指」）。 */
  fingerLabel?: string;
  /** 密度（本/mm）。測っていない場合は null。 */
  densityPerMm?: number | null;
  /** 流れの印象の表示名。未選択は null。 */
  flowLabel?: string | null;
  /** 色の印象の表示名。未選択は null。 */
  colorLabel?: string | null;
  /** 選択されたパターン（コード＋名前＋4部構成の説明）。 */
  patterns?: DraftReportPatternInput[];
  /** 臨床フラグの表示名の一覧。 */
  clinicalFlags?: string[];
  /** 前回との変化の表示名。初回などは null。 */
  changeVsPrevLabel?: string | null;
}

interface DraftReportResult {
  /** APIキーが設定済みかどうか。false のとき summary / advice は空。 */
  configured: boolean;
  /** 所見のまとめの下書き。 */
  summary: string;
  /** アドバイスの下書き。 */
  advice: string;
}

/** 文字列入力を検証して切り詰める。文字列でなければ空文字。 */
function shortText(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.slice(0, max) : "";
}

/** null 許容のラベル入力。空文字は null にそろえる。 */
function labelOrNull(raw: unknown): string | null {
  const t = shortText(raw, MAX_LABEL_LENGTH).trim();
  return t ? t : null;
}

function buildDraftPrompt(input: {
  fingerLabel: string;
  densityPerMm: number | null;
  flowLabel: string | null;
  colorLabel: string | null;
  patterns: DraftReportPatternInput[];
  clinicalFlags: string[];
  changeVsPrevLabel: string | null;
}): string {
  const lines: string[] = [];
  lines.push("次は、爪郭毛細血管の観察で記録された所見です。");
  lines.push(`観察した指：${input.fingerLabel || "記録なし"}`);
  lines.push(
    input.densityPerMm != null
      ? `密度：1mmあたり${input.densityPerMm}本`
      : "密度：記録なし",
  );
  lines.push(`流れの印象：${input.flowLabel ?? "記録なし"}`);
  lines.push(`色の印象：${input.colorLabel ?? "記録なし"}`);
  if (input.patterns.length > 0) {
    lines.push("選択された形（パターン）とその説明：");
    for (const p of input.patterns) {
      lines.push(`- ${p.name}`);
      lines.push(`  特徴：${p.feature}`);
      lines.push(`  原因：${p.why}`);
      lines.push(`  重なりやすい症状：${p.symptoms}`);
      lines.push(`  未病の見方：${p.mibyo}`);
    }
  } else {
    lines.push("選択された形（パターン）：なし");
  }
  lines.push(
    input.clinicalFlags.length > 0
      ? `臨床フラグ：${input.clinicalFlags.join("、")}`
      : "臨床フラグ：なし",
  );
  lines.push(`前回との変化：${input.changeVsPrevLabel ?? "記録なし"}`);
  lines.push("");
  lines.push(
    "この所見をもとに、レポートに載せる「所見のまとめ」と「アドバイス」の下書きを作ってください。",
  );
  lines.push(
    "summary には、今回の観察で確認した内容（指、密度、流れと色の印象、見られた形とその読み方、前回との変化）を書いてください。",
  );
  lines.push(
    "advice には、この所見をふまえて日常生活で取り組める具体的な内容（食事、運動、睡眠、冷えへの備えなど、所見と結びつくもの）を書いてください。",
  );
  if (input.clinicalFlags.length > 0) {
    lines.push(
      "臨床フラグがあるため、summary か advice の中に、医療機関への受診を促す一文を必ず入れてください。",
    );
  }
  lines.push(
    '出力は次の形式の JSON のみとしてください: {"summary": "所見のまとめ", "advice": "アドバイス"}',
  );
  return lines.join("\n");
}

/**
 * AIによるレポート文の下書き（試作）。
 * - スタッフ認証が必須（requireActiveStaff）。
 * - 入力は所見の内容だけ。氏名・ID 等の情報は含めない。
 * - AI は下書きを作るだけ。スタッフが画面で確認・手直しして保存する
 *   前提で、ここでは何も保存しない。
 * - APIキー未設定のときはエラーを投げず { configured: false } を返す。
 */
export const draftReportText = onCall<
  DraftReportRequest,
  Promise<DraftReportResult>
>(
  { region: REGION, secrets: [openAiApiKey], timeoutSeconds: 120 },
  async (request) => {
    await requireActiveStaff(request.auth?.uid);

    const data = request.data ?? {};
    const fingerLabel = shortText(data.fingerLabel, MAX_LABEL_LENGTH);
    const densityPerMm =
      typeof data.densityPerMm === "number" &&
      Number.isFinite(data.densityPerMm) &&
      data.densityPerMm >= 0 &&
      data.densityPerMm <= 100
        ? data.densityPerMm
        : null;
    const flowLabel = labelOrNull(data.flowLabel);
    const colorLabel = labelOrNull(data.colorLabel);
    const changeVsPrevLabel = labelOrNull(data.changeVsPrevLabel);

    // パターンは28種の正規コードと照合し、不正なものは捨てる。
    const patterns: DraftReportPatternInput[] = [];
    if (Array.isArray(data.patterns)) {
      for (const raw of data.patterns) {
        if (patterns.length >= PATTERN_SUMMARIES.length) break;
        if (typeof raw !== "object" || raw === null) continue;
        const p = raw as unknown as Record<string, unknown>;
        if (typeof p.code !== "string" || !PATTERN_CODE_SET.has(p.code)) {
          continue;
        }
        if (patterns.some((x) => x.code === p.code)) continue;
        patterns.push({
          code: p.code,
          name: shortText(p.name, MAX_LABEL_LENGTH),
          feature: shortText(p.feature, MAX_PATTERN_TEXT_LENGTH),
          why: shortText(p.why, MAX_PATTERN_TEXT_LENGTH),
          symptoms: shortText(p.symptoms, MAX_PATTERN_TEXT_LENGTH),
          mibyo: shortText(p.mibyo, MAX_PATTERN_TEXT_LENGTH),
        });
      }
    }
    const clinicalFlags: string[] = [];
    if (Array.isArray(data.clinicalFlags)) {
      for (const raw of data.clinicalFlags) {
        if (clinicalFlags.length >= 8) break;
        const t = labelOrNull(raw);
        if (t) clinicalFlags.push(t);
      }
    }

    let apiKey = "";
    try {
      apiKey = openAiApiKey.value();
    } catch {
      apiKey = "";
    }
    if (!apiKey) {
      return { configured: false, summary: "", advice: "" };
    }

    const model = process.env.OPENAI_TEXT_MODEL || "gpt-6-luna";
    // 推論系モデルは temperature を受け付けないため reasoning_effort に置き換える。
    const sampling: Record<string, unknown> =
      /^gpt-[56]/.test(model) || /^o[0-9]/.test(model)
        ? { reasoning_effort: "low" }
        : { temperature: 0.4 };

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          ...sampling,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "あなたは自由診療クリニックの毛細血管観察レポートの下書きを作るアシスタントです。",
                "文体は、一般の人に向けた平易な日本語で、クリニックの案内のような信頼感のある落ち着いた言い回しにしてください。",
                "summary も advice も、箇条書きではなく、流れる文章で書いてください。見出しや記号での区切りは入れないでください。",
                "独自の比喩や凝った言い回しは使わないでください。",
                "否定的な言い方や、注意書き・免責のような注記は書かないでください。",
                "これは観察の記録と生活アドバイスです。診断や病名の断定、治療や製品の効能の断定はしないでください。入力にない数値や事実を作らないでください。",
              ].join("\n"),
            },
            {
              role: "user",
              content: buildDraftPrompt({
                fingerLabel,
                densityPerMm,
                flowLabel,
                colorLabel,
                patterns,
                clinicalFlags,
                changeVsPrevLabel,
              }),
            },
          ],
        }),
      });
    } catch {
      throw new HttpsError(
        "internal",
        "下書きの作成に失敗しました。時間をおいてもう一度お試しください。",
      );
    }
    if (!response.ok) {
      throw new HttpsError(
        "internal",
        "下書きの作成に失敗しました。時間をおいてもう一度お試しください。",
      );
    }

    const resData = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = resData.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new HttpsError("internal", "AIの応答を読み取れませんでした。");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new HttpsError("internal", "AIの応答を読み取れませんでした。");
    }
    const obj = parsed as { summary?: unknown; advice?: unknown };
    const summary = shortText(obj.summary, MAX_DRAFT_LENGTH).trim();
    const advice = shortText(obj.advice, MAX_DRAFT_LENGTH).trim();
    if (!summary && !advice) {
      throw new HttpsError("internal", "AIの応答を読み取れませんでした。");
    }

    return { configured: true, summary, advice };
  },
);

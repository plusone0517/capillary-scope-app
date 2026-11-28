// カメラ撮影と画像取り込みのヘルパー。
//
// 撮影は video要素 + canvas のキャプチャのみを使う（Safariでも動く方式）。
// ImageCapture など Chrome専用APIには依存しない。

export type CapturedImage = {
  dataBase64: string;
  mimeType: "image/jpeg" | "image/png";
  previewUrl: string;
};

const MAX_DIM = 1600;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("画像の読み込みに失敗しました"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(blob);
  });
}

async function canvasToCaptured(
  canvas: HTMLCanvasElement,
): Promise<CapturedImage> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("画像の撮影に失敗しました");
  const dataBase64 = await blobToBase64(blob);
  return {
    dataBase64,
    mimeType: "image/jpeg",
    previewUrl: URL.createObjectURL(blob),
  };
}

export type CaptureOptions = {
  /**
   * ソフトウェア明るさ補正（%）。100以外を指定すると Canvas の filter で
   * プレビューと同じ補正を撮影画像にも適用する（未対応ブラウザでは無効）。
   */
  brightnessPct?: number;
  /**
   * 切り出し範囲（元映像のピクセル座標）。デジタルズーム時に、プレビューで
   * 見えている範囲だけを保存するために使う。
   */
  sourceRect?: { x: number; y: number; width: number; height: number };
};

/** ライブプレビュー中の video から静止画を1枚撮る。 */
export async function captureFromVideo(
  video: HTMLVideoElement,
  options: CaptureOptions = {},
): Promise<CapturedImage> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error("カメラの映像がまだ準備できていません");
  const rect = options.sourceRect ?? { x: 0, y: 0, width, height };
  const scale = Math.min(1, MAX_DIM / Math.max(rect.width, rect.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("画像の撮影に失敗しました");
  const pct = options.brightnessPct;
  if (pct != null && pct !== 100) {
    try {
      ctx2d.filter = `brightness(${pct / 100})`;
    } catch {
      // filter 未対応の環境では補正なしで撮影する。
    }
  }
  ctx2d.drawImage(
    video,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvasToCaptured(canvas);
}

/* ============ デジタルズームの表示ジオメトリ ============ */

/**
 * プレビュー枠（container）の中で、映像が実際に描かれる矩形（CSSピクセル）。
 * 映像は object-contain で枠に収まる前提で、デジタルズーム倍率と
 * パン（-1〜1、中心からのずれの割合）から拡大後の矩形を返す。
 * プレビュー表示と撮影時の切り出しで同じ計算を使い、見た目と保存画像を一致させる。
 */
export function computeZoomRect(
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number,
  zoom: number,
  panX: number,
  panY: number,
): { left: number; top: number; width: number; height: number } {
  const fit = Math.min(containerW / videoW, containerH / videoH);
  const width = videoW * fit * zoom;
  const height = videoH * fit * zoom;
  // 拡大した矩形が枠からはみ出す分だけ中心をずらせる（収まっている軸は中央固定）。
  const maxShiftX = Math.max(0, (width - containerW) / 2);
  const maxShiftY = Math.max(0, (height - containerH) / 2);
  const cx = containerW / 2 + panX * maxShiftX;
  const cy = containerH / 2 + panY * maxShiftY;
  return { left: cx - width / 2, top: cy - height / 2, width, height };
}

/**
 * computeZoomRect の矩形から、枠内に実際に見えている範囲を
 * 元映像のピクセル座標の切り出し範囲に変換する。
 */
export function cropFromZoomRect(
  rect: { left: number; top: number; width: number; height: number },
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number,
): { x: number; y: number; width: number; height: number } {
  const fx0 = Math.min(1, Math.max(0, (0 - rect.left) / rect.width));
  const fx1 = Math.min(1, Math.max(0, (containerW - rect.left) / rect.width));
  const fy0 = Math.min(1, Math.max(0, (0 - rect.top) / rect.height));
  const fy1 = Math.min(1, Math.max(0, (containerH - rect.top) / rect.height));
  return {
    x: fx0 * videoW,
    y: fy0 * videoH,
    width: Math.max(1, (fx1 - fx0) * videoW),
    height: Math.max(1, (fy1 - fy0) * videoH),
  };
}

/** 画像ファイルを読み込み、長辺1600pxまでに縮小して JPEG 化する。 */
export async function fileToCaptured(file: File): Promise<CapturedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("画像ファイルを読み込めませんでした"));
      el.src = url;
    });
    const scale = Math.min(
      1,
      MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) throw new Error("画像の読み込みに失敗しました");
    ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToCaptured(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ================= 動画 ================= */

export type CapturedVideo = {
  /**
   * 動画の実体（Blob のまま保持する）。保存時は base64 化せずそのまま
   * アップロードするため、長い動画でもメモリを圧迫しない。
   */
  blob: Blob;
  mimeType: "video/webm" | "video/mp4";
  previewUrl: string;
  durationSec: number | null;
};

/** MediaRecorder が使えるか（iPad Safari では使えない環境がある）。 */
export function detectRecorderSupport(): boolean {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
}

/** この環境で録画に使える MIME タイプを選ぶ（webm優先、なければmp4）。 */
export function pickRecorderMimeType(): "video/webm" | "video/mp4" | null {
  if (!detectRecorderSupport()) return null;
  if (MediaRecorder.isTypeSupported("video/webm")) return "video/webm";
  if (MediaRecorder.isTypeSupported("video/mp4")) return "video/mp4";
  return null;
}

/** 録画・取り込みした動画 Blob を保存用データに変換する。 */
export async function blobToCapturedVideo(
  blob: Blob,
  durationSec: number | null,
): Promise<CapturedVideo> {
  const mimeType = blob.type.includes("mp4") ? "video/mp4" : "video/webm";
  return {
    blob,
    mimeType,
    previewUrl: URL.createObjectURL(blob),
    durationSec,
  };
}

/** 動画ファイルを取り込む（専用ソフトで撮った動画など）。 */
export async function fileToCapturedVideo(file: File): Promise<CapturedVideo> {
  const mimeType = file.type.includes("mp4") ? "video/mp4" : "video/webm";
  const previewUrl = URL.createObjectURL(file);
  const durationSec = await new Promise<number | null>((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () =>
      resolve(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => resolve(null);
    el.src = previewUrl;
  });
  return { blob: file, mimeType, previewUrl, durationSec };
}

/**
 * 動画（Blob URL など）から静止画を1枚切り出す。
 * 動画だけの観察でも AI候補・自動計測が使えるよう、代表画像の材料にする。
 * 切り出し位置は長さの25%地点（長さが取れない形式では先頭フレーム）。
 * 対象は同一オリジンで読める URL（Blob URL）に限る。
 */
export async function captureFrameFromVideoUrl(
  src: string,
): Promise<CapturedImage> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(new Error("動画を読み込めませんでした"));
    });
    const duration = video.duration;
    const target =
      Number.isFinite(duration) && duration > 0
        ? Math.min(duration * 0.25, Math.max(0, duration - 0.05))
        : 0;
    if (target > 0) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          video.removeEventListener("seeked", finish);
          resolve();
        };
        video.addEventListener("seeked", finish);
        video.currentTime = target;
        window.setTimeout(finish, 1500);
      });
    } else {
      // 先頭フレームが描画されるまで少し待つ。
      await new Promise<void>((resolve) => {
        if (video.readyState >= 2) {
          resolve();
          return;
        }
        video.onloadeddata = () => resolve();
        window.setTimeout(resolve, 1500);
      });
    }
    return await captureFromVideo(video);
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export type CameraSupport =
  | { kind: "ok" }
  | { kind: "iphone" }
  | { kind: "unsupported" };

/** 端末がカメラ撮影に対応しているかを判定する。iPhoneは対象外として明示する。 */
export function detectCameraSupport(): CameraSupport {
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return { kind: "iphone" };
  if (
    typeof navigator.mediaDevices === "undefined" ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return { kind: "unsupported" };
  }
  return { kind: "ok" };
}

export function isIPad(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13以降は Mac と同じ UA を返すため、タッチ点数でも判定する。
  return /iPad/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

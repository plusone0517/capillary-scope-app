// 血流速度の試作計測（半自動・時空間画像法）。
//
// 手順:
// 1. 動画の1フレームを表示し、測りたい毛細血管に沿って始点・終点の2点を打つ。
// 2. その線上の画素を全フレーム分並べた時空間画像（縞模様）を生成する。
// 3. 縞の傾きから速度を推定する。自動推定（縞の整合が最大になる傾きを探索）
//    と、手動（縞に沿って2点を打つ）の両方を用意する。
// 速度は「試作・参考値」。校正値（μm/px）がある場合のみ mm/秒を出す。
//
// フレームレートは実測：一定間隔でサンプルしたフレーム列から、
// 重複フレーム（同じコマの再サンプル）を除いた実フレーム数 ÷ 動画の長さ。

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { LoadingState } from "./States";

type Point = { x: number; y: number };

type Kymograph = {
  data: Float32Array; // width * frames、グレースケール 0..255
  width: number;
  frames: number;
  fps: number;
  durationSec: number;
  /**
   * 解析用ピクセル1つが、元の動画の何ピクセルにあたるか（元の幅÷解析幅）。
   * 傾き（解析ピクセル/フレーム）を元の動画のピクセル基準に戻すために使う。
   * 校正値（μm/px）は元の動画のピクセルあたりの値なので、速度も
   * 元のピクセル基準でないと mm/秒への換算がずれる。
   */
  pxScale: number;
};

type Props = {
  observationId: string;
  videoUrl: string;
  initialCalibrationUmPerPx: number | null;
  savedResult: {
    pxPerSec: number;
    mmPerSec: number | null;
    method: string;
  } | null;
  onClose: () => void;
};

const MAX_ANALYSIS_WIDTH = 960;
const MAX_SAMPLES = 600;

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", finish);
      resolve();
    };
    video.addEventListener("seeked", finish);
    video.currentTime = time;
    window.setTimeout(finish, 1500);
  });
}

async function loadVideoElement(src: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("動画を読み込めませんでした"));
  });
  return video;
}

/** 動画URLを同一オリジンの Blob URL に変換する（canvas解析のため）。失敗時は元のURL。 */
async function toLocalUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return url;
  }
}

/** 縞の整合（時空間画像を傾けて重ねたときのプロファイルの分散）が最大になる傾きを探す。 */
function estimateSlope(kymo: Kymograph): number | null {
  const { data, width: w, frames: h } = kymo;
  if (w < 8 || h < 8) return null;

  const score = (s: number): number => {
    // 傾きが大きい候補では、変位が線の長さを超える前の時間窓だけを使う
    // （窓が短すぎる候補は評価しない）。
    const tMax =
      Math.abs(s) < 0.001
        ? h
        : Math.min(h, Math.floor((w * 0.9) / Math.abs(s)));
    if (tMax < 20) return -1;
    const prof = new Float32Array(w);
    const cnt = new Float32Array(w);
    for (let t = 0; t < tMax; t++) {
      const offset = s * t;
      const rowBase = t * w;
      for (let x = 0; x < w; x++) {
        const srcX = x + offset;
        if (srcX < 0 || srcX > w - 1) continue;
        const x0 = Math.floor(srcX);
        const fx = srcX - x0;
        const a = data[rowBase + x0] ?? 0;
        const b = data[rowBase + Math.min(x0 + 1, w - 1)] ?? 0;
        prof[x] = (prof[x] ?? 0) + a * (1 - fx) + b * fx;
        cnt[x] = (cnt[x] ?? 0) + 1;
      }
    }
    let n = 0;
    let mean = 0;
    for (let x = 0; x < w; x++) {
      const c = cnt[x] ?? 0;
      if (c > tMax * 0.5) {
        mean += (prof[x] ?? 0) / c;
        n++;
      }
    }
    if (n < 4) return -1;
    mean /= n;
    let variance = 0;
    for (let x = 0; x < w; x++) {
      const c = cnt[x] ?? 0;
      if (c > tMax * 0.5) {
        const d = (prof[x] ?? 0) / c - mean;
        variance += d * d;
      }
    }
    return variance / n;
  };

  let best = 0;
  let bestScore = -1;
  for (let s = -12; s <= 12.0001; s += 0.25) {
    const sc = score(s);
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  for (let s = best - 0.25; s <= best + 0.2501; s += 0.02) {
    const sc = score(s);
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  return best;
}

export function FlowMeasure({
  observationId,
  videoUrl,
  initialCalibrationUmPerPx,
  savedResult,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const kymoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const localUrlRef = useRef<string | null>(null);
  const analysisSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const [phase, setPhase] = useState<"frame" | "building" | "kymo">("frame");
  const [error, setError] = useState<string | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [linePoints, setLinePoints] = useState<Point[]>([]);
  const [buildProgress, setBuildProgress] = useState(0);
  const [kymo, setKymo] = useState<Kymograph | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualPoints, setManualPoints] = useState<Point[]>([]);
  const [slope, setSlope] = useState<number | null>(null);
  const [slopeMethod, setSlopeMethod] = useState<"auto" | "manual">("auto");
  const [calibration, setCalibration] = useState(
    initialCalibrationUmPerPx != null ? String(initialCalibrationUmPerPx) : "",
  );
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // 動画を読み込み、代表フレーム（長さの25%地点）を表示する。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const local = await toLocalUrl(videoUrl);
        if (cancelled) return;
        localUrlRef.current = local;
        const video = await loadVideoElement(local);
        if (cancelled) return;
        videoRef.current = video;
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const scale = Math.min(1, MAX_ANALYSIS_WIDTH / (video.videoWidth || 1));
        const w = Math.max(2, Math.round(video.videoWidth * scale));
        const h = Math.max(2, Math.round(video.videoHeight * scale));
        analysisSizeRef.current = { w, h };
        const canvas = frameCanvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        await seekTo(video, Math.min(duration * 0.25, Math.max(0, duration - 0.05)));
        if (cancelled) return;
        const ctx2d = canvas.getContext("2d");
        if (!ctx2d) throw new Error("フレームを表示できませんでした");
        ctx2d.drawImage(video, 0, 0, w, h);
        // canvas が解析可能か（同一オリジンか）を早期に確認する。
        try {
          ctx2d.getImageData(0, 0, 1, 1);
        } catch {
          throw new Error(
            "この動画はブラウザの制限で解析できませんでした。院内ネットワークの設定により動画の読み取りが制限されている可能性があります。",
          );
        }
        setFrameReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "動画の読み込みに失敗しました");
        }
      }
    })();
    return () => {
      cancelled = true;
      // Blob URL に変換していた場合は解放する（元のURLの場合は startsWith で判定）。
      if (localUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(localUrlRef.current);
      }
      localUrlRef.current = null;
    };
  }, [videoUrl]);

  // 線が変わるたびに代表フレームへ線を描き直す。
  useEffect(() => {
    if (phase !== "frame" || !frameReady) return;
    const video = videoRef.current;
    const canvas = frameCanvasRef.current;
    if (!video || !canvas) return;
    const { w, h } = analysisSizeRef.current;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    ctx2d.drawImage(video, 0, 0, w, h);
    ctx2d.strokeStyle = "#ffcf3f";
    ctx2d.fillStyle = "#ffcf3f";
    ctx2d.lineWidth = Math.max(2, w / 240);
    for (const p of linePoints) {
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, Math.max(5, w / 90), 0, Math.PI * 2);
      ctx2d.fill();
    }
    if (linePoints.length === 2) {
      const [a, b] = linePoints as [Point, Point];
      ctx2d.beginPath();
      ctx2d.moveTo(a.x, a.y);
      ctx2d.lineTo(b.x, b.y);
      ctx2d.stroke();
    }
  }, [linePoints, phase, frameReady]);

  // 時空間画像を canvas に描く（手動モードの点と線も重ねる）。
  useEffect(() => {
    if (phase !== "kymo" || !kymo) return;
    const canvas = kymoCanvasRef.current;
    if (!canvas) return;
    canvas.width = kymo.width;
    canvas.height = kymo.frames;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const img = ctx2d.createImageData(kymo.width, kymo.frames);
    for (let i = 0; i < kymo.width * kymo.frames; i++) {
      const v = Math.max(0, Math.min(255, Math.round(kymo.data[i] ?? 0)));
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx2d.putImageData(img, 0, 0);
    if (manualPoints.length > 0) {
      ctx2d.strokeStyle = "#ffcf3f";
      ctx2d.fillStyle = "#ffcf3f";
      ctx2d.lineWidth = Math.max(1.5, kymo.width / 240);
      for (const p of manualPoints) {
        ctx2d.beginPath();
        ctx2d.arc(p.x, p.y, Math.max(3, kymo.width / 110), 0, Math.PI * 2);
        ctx2d.fill();
      }
      if (manualPoints.length === 2) {
        const [a, b] = manualPoints as [Point, Point];
        ctx2d.beginPath();
        ctx2d.moveTo(a.x, a.y);
        ctx2d.lineTo(b.x, b.y);
        ctx2d.stroke();
      }
    }
  }, [phase, kymo, manualPoints]);

  const canvasPoint = (
    e: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ): Point => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handleFrameTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = frameCanvasRef.current;
    if (!canvas || !frameReady) return;
    const p = canvasPoint(e, canvas);
    setLinePoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
    setSlope(null);
  };

  const handleKymoTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!manualMode) return;
    const canvas = kymoCanvasRef.current;
    if (!canvas) return;
    const p = canvasPoint(e, canvas);
    setManualPoints((prev) => {
      const next = prev.length >= 2 ? [p] : [...prev, p];
      if (next.length === 2) {
        const [a, b] = next as [Point, Point];
        if (Math.abs(b.y - a.y) > 0.5) {
          setSlope((b.x - a.x) / (b.y - a.y));
          setSlopeMethod("manual");
        }
      }
      return next;
    });
  };

  const buildKymograph = useCallback(async () => {
    const video = videoRef.current;
    if (!video || linePoints.length !== 2) return;
    const [p1, p2] = linePoints as [Point, Point];
    const { w, h } = analysisSizeRef.current;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) {
      setError("動画の長さを取得できませんでした");
      return;
    }
    setError(null);
    setPhase("building");
    setBuildProgress(0);
    setSlope(null);
    setManualPoints([]);

    const lineLen = Math.max(2, Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y)));
    const sampleCount = Math.min(
      MAX_SAMPLES,
      Math.max(30, Math.round(duration * 60)),
    );
    const work = document.createElement("canvas");
    work.width = w;
    work.height = h;
    const wctx = work.getContext("2d", { willReadFrequently: true });
    if (!wctx) {
      setError("解析の準備に失敗しました");
      setPhase("frame");
      return;
    }

    const rows: Float32Array[] = [];
    let prevRow: Float32Array | null = null;
    try {
      for (let i = 0; i < sampleCount; i++) {
        const t = (i / sampleCount) * Math.max(0, duration - 0.02);
        await seekTo(video, t);
        wctx.drawImage(video, 0, 0, w, h);
        const img = wctx.getImageData(0, 0, w, h);
        const row = new Float32Array(lineLen);
        for (let s = 0; s < lineLen; s++) {
          const frac = lineLen === 1 ? 0 : s / (lineLen - 1);
          const x = p1.x + (p2.x - p1.x) * frac;
          const y = p1.y + (p2.y - p1.y) * frac;
          const x0 = Math.max(0, Math.min(w - 1, Math.floor(x)));
          const y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
          const x1 = Math.min(w - 1, x0 + 1);
          const y1 = Math.min(h - 1, y0 + 1);
          const fx = x - Math.floor(x);
          const fy = y - Math.floor(y);
          const sample = (xx: number, yy: number): number => {
            const idx = (yy * w + xx) * 4;
            const r = img.data[idx] ?? 0;
            const g = img.data[idx + 1] ?? 0;
            const b = img.data[idx + 2] ?? 0;
            return 0.299 * r + 0.587 * g + 0.114 * b;
          };
          row[s] =
            sample(x0, y0) * (1 - fx) * (1 - fy) +
            sample(x1, y0) * fx * (1 - fy) +
            sample(x0, y1) * (1 - fx) * fy +
            sample(x1, y1) * fx * fy;
        }
        // 同じコマの再サンプル（重複フレーム）は時間軸に数えない。
        let duplicate = false;
        if (prevRow) {
          let diff = 0;
          for (let s = 0; s < lineLen; s++) {
            diff += Math.abs((row[s] ?? 0) - (prevRow[s] ?? 0));
          }
          duplicate = diff / lineLen < 0.15;
        }
        if (!duplicate) {
          rows.push(row);
          prevRow = row;
        }
        if (i % 15 === 0) {
          setBuildProgress(Math.round(((i + 1) / sampleCount) * 100));
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    } catch {
      setError(
        "解析中に動画の画素を読み取れませんでした。ブラウザの制限の可能性があります。",
      );
      setPhase("frame");
      return;
    }

    if (rows.length < 8) {
      setError("フレーム数が少なく、計測できませんでした。もう少し長い動画でお試しください。");
      setPhase("frame");
      return;
    }
    const data = new Float32Array(lineLen * rows.length);
    rows.forEach((row, i) => data.set(row, i * lineLen));
    const built: Kymograph = {
      data,
      width: lineLen,
      frames: rows.length,
      fps: rows.length / duration,
      durationSec: duration,
      pxScale: video.videoWidth > 0 && w > 0 ? video.videoWidth / w : 1,
    };
    setKymo(built);
    setPhase("kymo");
    const auto = estimateSlope(built);
    if (auto != null && Number.isFinite(auto)) {
      setSlope(auto);
      setSlopeMethod("auto");
    }
  }, [linePoints]);

  const calibNum = (() => {
    const t = calibration.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  // 傾きは解析用ピクセル基準のため、元の動画のピクセル基準に戻してから
  // 速度とする（校正値 μm/px と同じ基準にそろえる）。
  const speedPxPerSec =
    slope != null && kymo ? Math.abs(slope) * kymo.fps * kymo.pxScale : null;
  const speedMmPerSec =
    speedPxPerSec != null && calibNum != null
      ? (speedPxPerSec * calibNum) / 1000
      : null;

  const save = useMutation({
    mutationFn: async () => {
      if (speedPxPerSec == null) throw new Error("速度がまだ決まっていません");
      return api.saveFlowMeasurement({
        id: observationId,
        calibrationUmPerPx: calibNum,
        speedPxPerSec,
        speedMmPerSec,
        method: slopeMethod,
      });
    },
    onSuccess: () => {
      setSavedNote("計測結果を保存しました。レポートに参考値として載ります。");
      void queryClient.invalidateQueries({ queryKey: ["observation", observationId] });
      void queryClient.invalidateQueries({ queryKey: ["observations"] });
    },
    onError: (e) =>
      setError(e instanceof Error ? `保存できませんでした：${e.message}` : "保存できませんでした"),
  });

  const clearSaved = useMutation({
    mutationFn: () => api.clearFlowMeasurement({ id: observationId }),
    onSuccess: () => {
      setSavedNote("保存済みの計測結果を取り消しました。");
      void queryClient.invalidateQueries({ queryKey: ["observation", observationId] });
      void queryClient.invalidateQueries({ queryKey: ["observations"] });
    },
    onError: (e) =>
      setError(e instanceof Error ? e.message : "取り消しに失敗しました"),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-wide text-[var(--heading)]">
          血流速度の計測（試作）
        </h1>
        <button
          type="button"
          onClick={onClose}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          レポートに戻る
        </button>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] p-4 text-base leading-relaxed text-[var(--text)]">
        <p>
          これは時空間画像法による<strong>試作計測</strong>で、結果は参考値です。診断や正常・異常の判定には使いません。
        </p>
        <p className="mt-1">
          注意：指や画面の<strong>ブレが大きい区間では縞が乱れ、結果が不安定になります</strong>。ブレの少ない動画ほど安定します。速度の向きは、引いた線の向き（始点→終点）で決まります。
        </p>
      </div>

      {savedResult && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
          <p className="text-lg font-bold text-[var(--heading)]">保存済みの計測結果</p>
          <p className="mt-1 text-xl font-bold text-[var(--heading)]">
            血流速度（試作・参考値）：
            {savedResult.mmPerSec != null
              ? `${savedResult.mmPerSec.toFixed(2)} mm/秒`
              : `${savedResult.pxPerSec.toFixed(1)} ピクセル/秒（校正値なし）`}
            （{savedResult.method === "manual" ? "手動" : "自動推定"}）
          </p>
          <button
            type="button"
            disabled={clearSaved.isPending}
            onClick={() => clearSaved.mutate()}
            className="mt-2 min-h-11 rounded border border-[var(--border)] px-4 text-base text-[var(--alert)] disabled:opacity-40"
          >
            この結果を取り消す
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-lg font-medium text-[var(--alert)]">
          {error}
        </p>
      )}

      <section aria-label="手順1：測る血管の線を引く" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-[var(--text)]">
          手順1：測りたい毛細血管に沿って、始点と終点の2点をタップ
        </h2>
        {!frameReady && !error && (
          <LoadingState compact label="動画を読み込んでいます…" />
        )}
        <canvas
          ref={frameCanvasRef}
          aria-label="動画の1フレーム。タップして線の始点と終点を指定"
          className="w-full cursor-crosshair rounded-[var(--radius)] border border-[var(--border)] bg-[var(--video-bg)]"
          onPointerDown={handleFrameTap}
        />
        <p className="text-base text-[var(--dim)]" aria-live="polite">
          {linePoints.length === 0 &&
            "血管の流れの始まり側をタップしてください（1点目）。"}
          {linePoints.length === 1 &&
            "流れの終わり側をタップしてください（2点目）。"}
          {linePoints.length === 2 &&
            "線が引けました。打ち直す場合は、もう一度タップすると1点目からやり直します。"}
        </p>
        <button
          type="button"
          disabled={linePoints.length !== 2 || phase === "building"}
          onClick={() => void buildKymograph()}
          className="min-h-16 rounded-[var(--radius)] bg-[var(--accent)] px-6 text-xl font-bold text-white disabled:opacity-40"
        >
          {phase === "building"
            ? `時空間画像を作っています… ${buildProgress}%`
            : "手順2：時空間画像を作る"}
        </button>
      </section>

      {phase === "kymo" && kymo && (
        <section aria-label="手順2：時空間画像と速度" className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-[var(--text)]">
            手順2：時空間画像（縞模様）から速度を決める
          </h2>
          <p className="text-base leading-relaxed text-[var(--text)]">
            横軸が血管に沿った位置、縦軸が時間（上から下へ流れます）です。流れる血球が斜めの縞になって見え、その傾きが速さです。実測フレームレート：約
            {kymo.fps.toFixed(1)} fps（実フレーム数{kymo.frames}÷動画の長さ
            {kymo.durationSec.toFixed(1)}秒）。
          </p>
          <canvas
            ref={kymoCanvasRef}
            aria-label="時空間画像。手動モードでは縞に沿って2点をタップ"
            className={`w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--video-bg)] ${
              manualMode ? "cursor-crosshair" : ""
            }`}
            style={{ imageRendering: "pixelated" }}
            onPointerDown={handleKymoTap}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={!manualMode}
              onClick={() => setManualMode(false)}
              className={`min-h-14 rounded-full px-5 text-lg font-medium ${
                !manualMode
                  ? "bg-[var(--accent)] font-bold text-white"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
              }`}
            >
              自動推定
            </button>
            <button
              type="button"
              aria-pressed={manualMode}
              onClick={() => {
                setManualMode(true);
                setManualPoints([]);
              }}
              className={`min-h-14 rounded-full px-5 text-lg font-medium ${
                manualMode
                  ? "bg-[var(--accent)] font-bold text-white"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
              }`}
            >
              手動で縞に沿って2点を打つ
            </button>
          </div>
          {manualMode && (
            <p className="text-base text-[var(--dim)]" aria-live="polite">
              {manualPoints.length < 2
                ? "1本の縞に沿って、上の点と下の点の2か所をタップしてください。"
                : "2点から傾きを決めました。打ち直す場合はもう一度タップしてください。"}
            </p>
          )}

          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
            <p className="text-lg font-bold text-[var(--heading)]">
              血流速度（試作・参考値）
            </p>
            {speedPxPerSec != null ? (
              <p className="mt-1 text-3xl font-bold text-[var(--heading)]">
                {speedMmPerSec != null
                  ? `${speedMmPerSec.toFixed(2)} mm/秒`
                  : `${speedPxPerSec.toFixed(1)} ピクセル/秒`}
                <span className="ml-2 text-base font-normal text-[var(--dim)]">
                  （{slopeMethod === "manual" ? "手動" : "自動推定"}／
                  {speedPxPerSec.toFixed(1)} ピクセル/秒）
                </span>
              </p>
            ) : (
              <p className="mt-1 text-lg text-[var(--dim)]">
                傾きがまだ決まっていません。自動推定がうまくいかない場合は、手動モードで縞に沿って2点を打ってください。
              </p>
            )}
            <label className="mt-3 flex flex-col gap-1 text-base font-medium text-[var(--text)]">
              校正値：1ピクセルあたりの長さ（μm/px）
              <input
                aria-label="校正値（μm/px）"
                inputMode="decimal"
                className="min-h-14 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-lg text-[var(--text)]"
                value={calibration}
                onChange={(e) => setCalibration(e.target.value)}
                placeholder="例：1.25（目盛りで校正した値を入力）"
              />
            </label>
            <p className="mt-1 text-base text-[var(--dim)]">
              校正値が未入力の場合はピクセル/秒までを表示し、mm/秒は出しません。校正値はこの観察に保存されます。
            </p>
            <button
              type="button"
              disabled={speedPxPerSec == null || save.isPending}
              onClick={() => save.mutate()}
              className="mt-3 min-h-14 rounded-[var(--radius)] bg-[var(--accent)] px-5 text-lg font-bold text-white disabled:opacity-40"
            >
              {save.isPending ? "保存しています…" : "この結果を所見に保存する"}
            </button>
            {savedNote && (
              <p className="mt-2 text-base font-medium text-[var(--accent-strong)]">
                {savedNote}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

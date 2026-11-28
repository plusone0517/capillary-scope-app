// 静止画の自動計測（試作）：AIではなく古典的な画像処理で、代表画像から
// 密度・ループ幅・蛇行の目安を推定する。計算はすべてブラウザ内で完結し、
// 画像を外部に送信することはない。結果は「試作・参考値」で、スタッフが
// 抽出の重ね表示と見比べて確認してから使う前提。
//
// 手順:
// 1. 解析用に縮小（長辺880pxまで）して画素を読む。
// 2. 血管の抽出：緑チャンネルは血液（ヘモグロビン）に吸収されて暗く写る
//    ことを使い、「周辺より緑が暗い度合い」と「周辺より赤みが強い度合い」を
//    合わせた信号を作る。周辺との比較は大きなぼかし（背景推定）との差分で
//    行うため、画面全体の明るさムラの影響を受けにくい。
// 3. 信号を大津法で二値化し、小さなノイズ（連結成分）を除く。
// 4. 密度：ループの頂点（遠位列）が始まる行を探し、その少し下の水平線を
//    横切る血管の本数を数える。1つのループは2本の脚で横切るため、本数÷2
//    がループ数。実幅（較正値 μm/px × 画像の元幅）で割って本/mmにする。
// 5. ループ幅：水平線上の血管の並びを2本ずつ組にし、外側の幅の平均。
// 6. 蛇行：二値画像を細線化（Zhang-Suen法）して中心線を取り、
//    「中心線の長さ ÷（2×高さ）」をループごとに求めて中央値を取る。
//    まっすぐなヘアピン型で約1.0、曲がりが多いほど大きくなる。
//
// 較正値（μm/px）は「元の静止画の1ピクセルあたりの長さ」として扱い、
// 解析用の縮小分は換算に織り込む。

export type AutoMeasureResult = {
  /** 数えたループの本数。 */
  loopCount: number;
  /** 密度（本/mm）。較正値がある場合のみ。 */
  densityPerMm: number | null;
  /** ループ幅の平均（元の静止画のピクセル）。 */
  loopWidthPx: number;
  /** ループ幅の平均（μm）。較正値がある場合のみ。 */
  loopWidthUm: number | null;
  /** 蛇行の目安（1.0に近いほどまっすぐ）。測れない場合は null。 */
  tortuosity: number | null;
  /** 元画像（解析サイズ）。 */
  originalCanvas: HTMLCanvasElement;
  /** 抽出結果を重ねた確認用画像（解析サイズ）。 */
  overlayCanvas: HTMLCanvasElement;
};

export type AutoMeasureOutcome =
  | { ok: true; result: AutoMeasureResult }
  | { ok: false; message: string };

const MAX_ANALYSIS_DIM = 880;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 水平方向・垂直方向の2回に分けたボックスぼかし（周辺は端の値で埋める）。 */
function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const win = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[row + clamp(x, 0, w - 1)] ?? 0;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / win;
      const xa = clamp(x - radius, 0, w - 1);
      const xb = clamp(x + radius + 1, 0, w - 1);
      sum += (src[row + xb] ?? 0) - (src[row + xa] ?? 0);
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[clamp(y, 0, h - 1) * w + x] ?? 0;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / win;
      const ya = clamp(y - radius, 0, h - 1);
      const yb = clamp(y + radius + 1, 0, h - 1);
      sum += (tmp[yb * w + x] ?? 0) - (tmp[ya * w + x] ?? 0);
    }
  }
  return out;
}

/** サンプリングしてパーセンタイルを求める（全体のソートを避けるための近似）。 */
function percentile(values: Float32Array, p: number): number {
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(values.length / 20000));
  for (let i = 0; i < values.length; i += step) sample.push(values[i] ?? 0);
  sample.sort((a, b) => a - b);
  const idx = clamp(Math.floor((p / 100) * sample.length), 0, sample.length - 1);
  return sample[idx] ?? 0;
}

/** 大津法で二値化のしきい値を決める。 */
function otsuThreshold(hist: Float64Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (hist[i] ?? 0);
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 0;
  for (let i = 0; i < 256; i++) {
    wB += hist[i] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * (hist[i] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = i;
    }
  }
  return threshold;
}

/**
 * 二値画像の連結成分を数え、小さな成分を取り除いたマスクを返す。
 * connectivity は 4（抽出マスク用）または 8（細線用）。
 */
function removeSmallComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea: number,
): Uint8Array {
  const labels = new Int32Array(mask.length).fill(-1);
  const out = new Uint8Array(mask);
  const stack: number[] = [];
  let nextLabel = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const label = nextLabel++;
    let area = 0;
    labels[start] = label;
    stack.length = 0;
    stack.push(start);
    const members: number[] = [];
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      area++;
      members.push(idx);
      const x = idx % w;
      const y = Math.floor(idx / w);
      if (x > 0 && mask[idx - 1] && labels[idx - 1] === -1) {
        labels[idx - 1] = label;
        stack.push(idx - 1);
      }
      if (x < w - 1 && mask[idx + 1] && labels[idx + 1] === -1) {
        labels[idx + 1] = label;
        stack.push(idx + 1);
      }
      if (y > 0 && mask[idx - w] && labels[idx - w] === -1) {
        labels[idx - w] = label;
        stack.push(idx - w);
      }
      if (y < h - 1 && mask[idx + w] && labels[idx + w] === -1) {
        labels[idx + w] = label;
        stack.push(idx + w);
      }
    }
    if (area < minArea) {
      for (const idx of members) out[idx] = 0;
    }
  }
  return out;
}

/** Zhang-Suen 法による細線化。 */
function skeletonize(mask: Uint8Array, w: number, h: number): Uint8Array {
  const img = new Uint8Array(mask);
  const at = (x: number, y: number): number => img[y * w + x] ?? 0;
  let changed = true;
  let iter = 0;
  while (changed && iter < 100) {
    changed = false;
    iter++;
    for (let step = 0; step < 2; step++) {
      const toRemove: number[] = [];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          if (!img[idx]) continue;
          // P2..P9：北から時計回り
          const p2 = at(x, y - 1);
          const p3 = at(x + 1, y - 1);
          const p4 = at(x + 1, y);
          const p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1);
          const p7 = at(x - 1, y + 1);
          const p8 = at(x - 1, y);
          const p9 = at(x - 1, y - 1);
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9];
          const b = seq.reduce((a, c) => a + c, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let i = 0; i < 8; i++) {
            if (seq[i] === 0 && seq[(i + 1) % 8] === 1) a++;
          }
          if (a !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          toRemove.push(idx);
        }
      }
      for (const idx of toRemove) {
        img[idx] = 0;
        changed = true;
      }
    }
  }
  return img;
}

/**
 * 細線の連結成分ごとに「長さ ÷（2×高さ）」を求め、妥当なものの中央値を返す。
 * まっすぐなヘアピン型のループで約1.0になる指標。
 */
function measureTortuosity(skel: Uint8Array, w: number, h: number): number | null {
  const labels = new Int32Array(skel.length).fill(-1);
  const stack: number[] = [];
  const indices: number[] = [];
  let nextLabel = 0;
  const minCount = Math.max(25, Math.round(h * 0.06));
  const minHeight = Math.max(24, Math.round(h * 0.12));
  for (let start = 0; start < skel.length; start++) {
    if (!skel[start] || labels[start] !== -1) continue;
    const label = nextLabel++;
    let count = 0;
    let minX = w;
    let maxX = -1;
    let minY = h;
    let maxY = -1;
    labels[start] = label;
    stack.length = 0;
    stack.push(start);
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      count++;
      const x = idx % w;
      const y = Math.floor(idx / w);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nIdx = ny * w + nx;
          if (skel[nIdx] && labels[nIdx] === -1) {
            labels[nIdx] = label;
            stack.push(nIdx);
          }
        }
      }
    }
    const height = maxY - minY + 1;
    const width = maxX - minX + 1;
    if (count < minCount || height < minHeight) continue;
    if (width > w * 0.6) continue; // 横に長く広がった成分はループではない
    const index = count / (2 * height);
    if (index >= 0.7 && index <= 2.5) indices.push(index);
  }
  if (indices.length < 2) return null;
  indices.sort((a, b) => a - b);
  const mid = Math.floor(indices.length / 2);
  return indices.length % 2 === 1
    ? (indices[mid] as number)
    : ((indices[mid - 1] as number) + (indices[mid] as number)) / 2;
}

/** 1行分について、血管の区間（ラン）を取り出す。細い断片は除き、近い区間はつなぐ。 */
function rowRuns(
  mask: Uint8Array,
  w: number,
  y: number,
): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let start = -1;
  for (let x = 0; x < w; x++) {
    const on = mask[y * w + x] === 1;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      runs.push({ start, end: x - 1 });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ start, end: w - 1 });
  // 幅2px未満の断片を除く
  const filtered = runs.filter((r) => r.end - r.start + 1 >= 2);
  // 2px以内の隙間は同じ血管としてつなぐ
  const merged: { start: number; end: number }[] = [];
  for (const r of filtered) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end - 1 <= 2) last.end = r.end;
    else merged.push({ ...r });
  }
  return merged;
}

/** 画像URLを読み込む。https の保存先URLは fetch で Blob 化してから読む
 * （canvas の画素読み取り制限を避けるため。FlowMeasure と同じ方針）。 */
async function loadDrawable(
  src: string,
): Promise<{ img: HTMLImageElement; cleanup: () => void }> {
  let url = src;
  let revoke = false;
  if (/^https?:/.test(src)) {
    try {
      const res = await fetch(src);
      if (res.ok) {
        url = URL.createObjectURL(await res.blob());
        revoke = true;
      }
    } catch {
      // fetch できない場合は、そのまま読み込みを試す。
    }
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    if (!revoke && /^https?:/.test(url)) el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("画像を読み込めませんでした"));
    el.src = url;
  });
  return {
    img,
    cleanup: () => {
      if (revoke) URL.revokeObjectURL(url);
    },
  };
}

/**
 * 代表画像を解析する。calibrationUmPerPx は元の静止画の1ピクセルあたりの
 * 長さ（μm）。null の場合は本数とピクセル単位までを返し、mm換算はしない。
 */
export async function analyzeCapillaryImage(
  src: string,
  calibrationUmPerPx: number | null,
): Promise<AutoMeasureOutcome> {
  let drawable: { img: HTMLImageElement; cleanup: () => void };
  try {
    drawable = await loadDrawable(src);
  } catch {
    return { ok: false, message: "画像を読み込めませんでした。別の画像でお試しください。" };
  }
  const { img, cleanup } = drawable;
  try {
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    if (!naturalW || !naturalH) {
      return { ok: false, message: "画像を読み込めませんでした。別の画像でお試しください。" };
    }
    const scale = Math.min(1, MAX_ANALYSIS_DIM / Math.max(naturalW, naturalH));
    const w = Math.max(2, Math.round(naturalW * scale));
    const h = Math.max(2, Math.round(naturalH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: false, message: "解析の準備に失敗しました。" };
    ctx.drawImage(img, 0, 0, w, h);
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch {
      return {
        ok: false,
        message: "ブラウザの制限で画像を読み取れませんでした。取り込んだ画像でお試しください。",
      };
    }
    await tick();

    const px = imageData.data;
    const n = w * h;
    const green = new Float32Array(n);
    const redness = new Float32Array(n);
    let lumSum = 0;
    for (let i = 0; i < n; i++) {
      const r = px[i * 4] ?? 0;
      const g = px[i * 4 + 1] ?? 0;
      const b = px[i * 4 + 2] ?? 0;
      green[i] = g;
      redness[i] = r - g;
      lumSum += 0.299 * r + 0.587 * g + 0.114 * b;
    }
    const meanLum = lumSum / n;
    if (meanLum < 35) {
      return {
        ok: false,
        message: "映像が暗く、血管をはっきり捉えられませんでした。明るさを調整して撮り直してください。",
      };
    }

    // 背景推定（大きなぼかし）との差分で、血管らしさの信号を作る。
    const radius = clamp(Math.round(w / 24), 10, 40);
    const bgGreen = boxBlur(green, w, h, radius);
    const bgRed = boxBlur(redness, w, h, radius);
    const signal = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const dark = (bgGreen[i] ?? 0) - (green[i] ?? 0);
      const red = Math.max(0, (redness[i] ?? 0) - (bgRed[i] ?? 0));
      signal[i] = dark + 0.6 * red;
    }
    await tick();

    const p50 = percentile(signal, 50);
    const p99 = percentile(signal, 99);
    if (p99 - p50 < 6) {
      return {
        ok: false,
        message:
          "血管と周りのコントラストが弱く、はっきり捉えられませんでした。ピントと明るさを確認して撮り直してください。",
      };
    }
    const clip = percentile(signal, 99.5);
    const hist = new Float64Array(256);
    let histTotal = 0;
    for (let i = 0; i < n; i++) {
      const v = clamp(((signal[i] ?? 0) / clip) * 255, 0, 255);
      hist[Math.floor(v)] = (hist[Math.floor(v)] ?? 0) + 1;
      histTotal++;
    }
    const otsuBin = otsuThreshold(hist, histTotal);
    const floorBin = ((p50 + 0.35 * (p99 - p50)) / clip) * 255;
    const threshold = (Math.max(otsuBin, floorBin) / 255) * clip;

    let mask: Uint8Array = new Uint8Array(n);
    let maskCount = 0;
    for (let i = 0; i < n; i++) {
      if ((signal[i] ?? 0) > threshold) {
        mask[i] = 1;
        maskCount++;
      }
    }
    const coverage = maskCount / n;
    if (coverage < 0.003) {
      return {
        ok: false,
        message: "血管らしき部分がほとんど見つかりませんでした。指の位置とピントを確認して撮り直してください。",
      };
    }
    if (coverage > 0.45) {
      return {
        ok: false,
        message: "画像全体が血管として拾われてしまい、うまく抽出できませんでした。明るさのムラが少ない画像でお試しください。",
      };
    }
    mask = removeSmallComponents(mask, w, h, Math.max(10, Math.round(n * 0.00005)));
    await tick();

    // 行ごとの血管画素数から、遠位列（ループの頂点の並び）が始まる行を探す。
    const rowCount = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let c = 0;
      for (let x = 0; x < w; x++) if (mask[y * w + x]) c++;
      rowCount[y] = c;
    }
    const smoothWin = Math.max(2, Math.round(h * 0.02));
    const smoothed = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      let cnt = 0;
      for (let dy = -smoothWin; dy <= smoothWin; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < h) {
          sum += rowCount[yy] ?? 0;
          cnt++;
        }
      }
      smoothed[y] = sum / cnt;
    }
    const rowThreshold = Math.max(6, w * 0.02);
    let apexY = -1;
    for (let y = 0; y < h; y++) {
      if ((smoothed[y] ?? 0) >= rowThreshold) {
        apexY = y;
        break;
      }
    }
    if (apexY < 0) {
      return {
        ok: false,
        message: "ループの並び（遠位列）をはっきり捉えられませんでした。爪の際が写っている画像でお試しください。",
      };
    }

    // 頂点の少し下の水平線で、横切る血管を数える。
    const depthCandidates = [0.07, 0.12, 0.17];
    let scanY = -1;
    let runs: { start: number; end: number }[] = [];
    for (const frac of depthCandidates) {
      const y = Math.min(h - 2, apexY + Math.round(h * frac));
      const rowsToTry = [y - 1, y, y + 1].filter((yy) => yy >= 0 && yy < h);
      const runsPerRow = rowsToTry.map((yy) => rowRuns(mask, w, yy));
      const counts = runsPerRow.map((r) => r.length).sort((a, b) => a - b);
      const medianCount = counts[Math.floor(counts.length / 2)] ?? 0;
      const medianRow = runsPerRow.find((r) => r.length === medianCount) ?? runsPerRow[0];
      if (medianRow && medianRow.length >= 4) {
        scanY = y;
        runs = medianRow;
        break;
      }
      if (medianRow && medianRow.length > runs.length) {
        scanY = y;
        runs = medianRow;
      }
    }
    if (runs.length < 2) {
      return {
        ok: false,
        message: "ループの本数を数えられませんでした。抽出結果が合っているか、ピントの合った画像でお試しください。",
      };
    }
    const loopCount = Math.max(1, Math.round(runs.length / 2));

    // ループ幅：並んだ血管を2本ずつ組にし、外側の幅の平均を取る。
    const widthsAnalysisPx: number[] = [];
    for (let i = 0; i + 1 < runs.length; i += 2) {
      const a = runs[i] as { start: number; end: number };
      const b = runs[i + 1] as { start: number; end: number };
      widthsAnalysisPx.push(b.end - a.start + 1);
    }
    const meanWidthAnalysisPx =
      widthsAnalysisPx.length > 0
        ? widthsAnalysisPx.reduce((a, c) => a + c, 0) / widthsAnalysisPx.length
        : 0;
    const loopWidthPx = meanWidthAnalysisPx / scale;
    // 較正値は元の静止画の1ピクセルあたり。幅は元のピクセルに戻してから掛ける。
    const loopWidthUm =
      calibrationUmPerPx != null ? loopWidthPx * calibrationUmPerPx : null;
    const densityPerMm =
      calibrationUmPerPx != null
        ? loopCount / ((naturalW * calibrationUmPerPx) / 1000)
        : null;
    await tick();

    // 蛇行：細線化して中心線の長さから求める。
    const skel = skeletonize(mask, w, h);
    const tortuosity = measureTortuosity(skel, w, h);
    await tick();

    // 確認用の重ね表示：元画像＋抽出（ティール）＋計測線（黄色）と数えた位置。
    const originalCanvas = document.createElement("canvas");
    originalCanvas.width = w;
    originalCanvas.height = h;
    const octx = originalCanvas.getContext("2d");
    if (octx) octx.drawImage(img, 0, 0, w, h);

    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = w;
    overlayCanvas.height = h;
    const vctx = overlayCanvas.getContext("2d");
    if (vctx) {
      vctx.drawImage(img, 0, 0, w, h);
      const tint = vctx.createImageData(w, h);
      for (let i = 0; i < n; i++) {
        if (mask[i]) {
          tint.data[i * 4] = 18;
          tint.data[i * 4 + 1] = 128;
          tint.data[i * 4 + 2] = 138;
          tint.data[i * 4 + 3] = 165;
        }
      }
      const tintCanvas = document.createElement("canvas");
      tintCanvas.width = w;
      tintCanvas.height = h;
      const tctx = tintCanvas.getContext("2d");
      if (tctx) {
        tctx.putImageData(tint, 0, 0);
        vctx.drawImage(tintCanvas, 0, 0);
      }
      vctx.strokeStyle = "rgba(255,255,255,0.75)";
      vctx.lineWidth = 1;
      vctx.beginPath();
      vctx.moveTo(0, apexY + 0.5);
      vctx.lineTo(w, apexY + 0.5);
      vctx.stroke();
      vctx.strokeStyle = "#ffcf3f";
      vctx.lineWidth = Math.max(2, w / 300);
      vctx.beginPath();
      vctx.moveTo(0, scanY + 0.5);
      vctx.lineTo(w, scanY + 0.5);
      vctx.stroke();
      vctx.fillStyle = "#ffcf3f";
      for (const r of runs) {
        const cx = (r.start + r.end) / 2;
        vctx.beginPath();
        vctx.arc(cx, scanY, Math.max(3, w / 160), 0, Math.PI * 2);
        vctx.fill();
      }
    }

    return {
      ok: true,
      result: {
        loopCount,
        densityPerMm,
        loopWidthPx,
        loopWidthUm,
        tortuosity,
        originalCanvas,
        overlayCanvas,
      },
    };
  } finally {
    cleanup();
  }
}

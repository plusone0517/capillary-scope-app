// 本数（密度）を画像の上で数える画面（全画面の重ね表示）。
// 自動でできるところは自動でやり、人は確かめて直すだけにする：
//   ①目盛り … 画像に写った目盛りを自動で読む（scaleDetect.ts）。
//   ②数える範囲 … 先端の列に沿って、画像の中央に 1mm の線を自動で置く。
//   ③先端 … 候補を自動で置く（tipDetect.ts）。違う点は押して消し、足りない先端は押して足す。
// 自動で読めない画像では、これまでどおり人がなぞって・押して数える。
// 計算は densityCount.ts。人が確かめた位置と、自動の候補の両方を記録に残す。
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildMeasurement,
  defaultLine,
  densityPerMm,
  distancePx,
  isWithinRange,
  lineAlongRow,
  loadCalibration,
  moveLine,
  nearestPointIndex,
  positionAlong,
  pxToMm,
  saveCalibration,
  umPerPxFromLine,
  type CalibrationSource,
  type DensityMeasurement,
  type Point,
} from "./densityCount";
import {
  detectScaleBar,
  loadScaleLabelMm,
  readImagePixels,
  saveScaleLabelMm,
  type ScaleBar,
} from "./scaleDetect";
import { detectLoopTips, TIP_DETECT_VERSION, type TipDetection } from "./tipDetect";
import {
  assessImageQuality,
  qualityAdvice,
  toStoredQuality,
  type ImageQuality,
} from "./imageQuality";

type Line = { start: Point; end: Point };
/** 「1つ戻す」で戻せるように、数え方の状態をまとめて覚える。 */
type Snapshot = { manual: Point[]; override: Record<number, boolean> };

const barButton =
  "min-h-11 rounded-[var(--radius)] border border-white/40 bg-white/10 px-4 text-base font-bold text-white disabled:opacity-40";
const primaryBarButton =
  "min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-5 text-base font-bold text-white disabled:opacity-40";

export function DensityCounter({
  imageUrl,
  initial,
  onDone,
  onClose,
}: {
  imageUrl: string;
  /** 前に数えた記録（同じ画像のもの）。あれば続きから直せる。 */
  initial?: DensityMeasurement | null;
  onDone: (measurement: DensityMeasurement) => void;
  onClose: () => void;
}) {
  // 目盛り合わせ用に別の画像（目盛りを撮った画像）を一時的に開いているときのURL。
  const [scaleImageUrl, setScaleImageUrl] = useState<string | null>(null);
  const shownUrl = scaleImageUrl ?? imageUrl;
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [umPerPx, setUmPerPx] = useState<number | null>(null);
  const [mode, setMode] = useState<"calibrate" | "count">("count");
  const [calibLine, setCalibLine] = useState<Line | null>(null);
  const [realLength, setRealLength] = useState("1");
  const [line, setLine] = useState<Line | null>(null);
  // 人が押して足した先端。
  const [manual, setManual] = useState<Point[]>([]);
  // 自動で出した先端の候補（遠位列として見つけたもの全部）。
  const [proposals, setProposals] = useState<Point[]>([]);
  // 候補ごとの人の判断（true=数える、false=数えない）。無い候補は「線の範囲の中なら数える」。
  const [override, setOverride] = useState<Record<number, boolean>>({});
  const [history, setHistory] = useState<Snapshot[]>([]);
  // この画像から自動で読み取った結果（読めない画像では null）。
  const [detection, setDetection] = useState<TipDetection | null>(null);
  const [quality, setQuality] = useState<ImageQuality | null>(null);
  const [pixelsReadable, setPixelsReadable] = useState(false);
  // 前の記録に残っていた候補（数え直しても、出し直さない限り引き継ぐ）。
  const carriedProposal = useRef<DensityMeasurement["proposal"] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // この画像から自動で読み取った目盛り（写っていなければ null）。
  const [detected, setDetected] = useState<ScaleBar | null>(null);
  const [source, setSource] = useState<CalibrationSource>("manual");
  const svgRef = useRef<SVGSVGElement | null>(null);
  // 線の上を押したときは、動かしたのか（ドラッグ）、その場を押しただけか（先端の指定）を
  // 指を離すまで決めない。先端は線のすぐ近くにあるため、押しただけなら点として扱う。
  const drag = useRef<{ kind: "calib" | "bar"; last: Point; start: Point; moved: boolean } | null>(
    null,
  );
  const restored = useRef(false);

  /**
   * 数える準備：先端の候補があれば、列に沿って線を置き、候補を並べる。
   * 無ければ、線を画像の中央に水平に置く（人が動かして合わせる）。
   */
  const placeForCounting = (w: number, h: number, um: number, det: TipDetection | null) => {
    setManual([]);
    setOverride({});
    setHistory([]);
    if (det && det.row && det.tips.length > 0) {
      carriedProposal.current = null;
      setProposals(det.tips);
      // 線は、いちばん上の先端よりさらに少し上に置く（点が線に重ならないように）。
      const row = det.row;
      const above = Math.max(0, ...det.tips.map((t) => row.slope * t.x + row.intercept - t.y));
      setLine(lineAlongRow(row, w, h, um, above + (w / 400) * 7));
    } else {
      setProposals([]);
      setLine(defaultLine(w, h, um));
    }
  };

  // 画像が読めたら、保存済みの記録か、この端末の目盛り合わせを使って準備する。
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    // 画素を読めれば、目盛り・先端の候補・画質を自動で読み取る。
    const pixels = readImagePixels(img);
    const bar = pixels ? detectScaleBar(pixels) : null;
    if (scaleImageUrl) {
      // 目盛りを撮った別の画像：見つかった線を最初から引いておく。
      setMode("calibrate");
      setCalibLine(bar ? { start: bar.start, end: bar.end } : null);
      if (bar) setRealLength(String(loadScaleLabelMm()));
      return;
    }
    const det = pixels ? detectLoopTips(pixels) : null;
    setDetected(bar);
    setDetection(det);
    setQuality(pixels ? assessImageQuality(pixels) : null);
    setPixelsReadable(pixels != null);
    if (
      !restored.current &&
      initial &&
      initial.imageWidthPx === w &&
      initial.imageHeightPx === h
    ) {
      restored.current = true;
      setUmPerPx(initial.umPerPx);
      setSource(initial.calibrationSource ?? "manual");
      setLine({
        start: { x: initial.line.start.x * w, y: initial.line.start.y * h },
        end: { x: initial.line.end.x * w, y: initial.line.end.y * h },
      });
      // 前に確かめた位置をそのまま出す（候補は、押して出し直したときだけ置き直す）。
      setManual(initial.points.map((p) => ({ x: p.x * w, y: p.y * h })));
      setProposals([]);
      setOverride({});
      carriedProposal.current = initial.proposal ?? null;
      setMode("count");
      return;
    }
    restored.current = true;
    if (bar) {
      // この画像の目盛りから直接合わせる。倍率や解像度が変わっても合わせ直しは要らない。
      const labelMm = loadScaleLabelMm();
      const um = (labelMm * 1000) / bar.lengthPx;
      setUmPerPx(um);
      setSource("auto_scale");
      saveCalibration(w, um);
      if (!line) placeForCounting(w, h, um, det);
      setMode("count");
      setNote(`画像の目盛り（${labelMm} mm）を自動で読み取りました。`);
      return;
    }
    const saved = loadCalibration(w);
    if (saved) {
      setUmPerPx(saved);
      setSource("saved");
      if (!line) placeForCounting(w, h, saved, det);
      setMode("count");
      setNote("この画像には目盛りが写っていないため、前に合わせた値を使っています。倍率を変えた場合は「目盛りを合わせ直す」を押してください。");
    } else {
      setUmPerPx(null);
      setMode("calibrate");
    }
  };

  useEffect(() => {
    return () => {
      if (scaleImageUrl) URL.revokeObjectURL(scaleImageUrl);
    };
  }, [scaleImageUrl]);

  const toImagePoint = (e: React.PointerEvent): Point | null => {
    const svg = svgRef.current;
    if (!svg || !natural) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.max(0, Math.min(natural.w, ((e.clientX - rect.left) / rect.width) * natural.w)),
      y: Math.max(0, Math.min(natural.h, ((e.clientY - rect.top) / rect.height) * natural.h)),
    };
  };

  const unit = natural ? natural.w / 400 : 1; // 線や点の太さの基準（画像の幅に比例）

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toImagePoint(e);
    if (!p || !natural) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (mode === "calibrate") {
      setCalibLine({ start: p, end: p });
      drag.current = { kind: "calib", last: p, start: p, moved: true };
      return;
    }
    const role = (e.target as Element).getAttribute?.("data-role");
    if (role === "bar" && line) {
      drag.current = { kind: "bar", last: p, start: p, moved: false };
      return;
    }
    togglePoint(p);
  };

  // 数える先端：線の範囲にある候補（人が外したものを除く）＋人が足したもの。左から順に並べる。
  const counted = useMemo(() => {
    const list: { p: Point; kind: "auto" | "manual"; index: number }[] = [];
    proposals.forEach((p, index) => {
      const include = override[index] ?? (line ? isWithinRange(p, line) : false);
      if (include) list.push({ p, kind: "auto", index });
    });
    manual.forEach((p, index) => list.push({ p, kind: "manual", index }));
    if (line) {
      list.sort((a, b) => (positionAlong(a.p, line) ?? 0) - (positionAlong(b.p, line) ?? 0));
    }
    return list;
  }, [proposals, override, manual, line]);
  const points = useMemo(() => counted.map((c) => c.p), [counted]);
  // 候補のうち、いま数えていないもの（範囲の外、または人が外したもの）。
  const idle = useMemo(() => {
    const used = new Set(counted.filter((c) => c.kind === "auto").map((c) => c.index));
    return proposals.map((p, index) => ({ p, index })).filter((c) => !used.has(c.index));
  }, [proposals, counted]);

  const remember = () => setHistory((h) => [...h.slice(-49), { manual, override }]);

  const togglePoint = (p: Point) => {
    const radius = unit * 5;
    remember();
    // 数えている点を押した → 外す。
    const hit = nearestPointIndex(points, p, radius);
    if (hit >= 0) {
      const c = counted[hit];
      if (c.kind === "manual") setManual((cur) => cur.filter((_, i) => i !== c.index));
      else setOverride((cur) => ({ ...cur, [c.index]: false }));
      return;
    }
    // 数えていない候補を押した → 数える。
    const idleHit = nearestPointIndex(
      idle.map((c) => c.p),
      p,
      radius,
    );
    if (idleHit >= 0) {
      const index = idle[idleHit].index;
      setOverride((cur) => ({ ...cur, [index]: true }));
      return;
    }
    setManual((cur) => [...cur, p]);
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setManual(last.manual);
    setOverride(last.override);
    setHistory(history.slice(0, -1));
  };

  const clearAll = () => {
    remember();
    setManual([]);
    setOverride(Object.fromEntries(proposals.map((_, i) => [i, false])));
  };

  /** 先端の候補を置き直す（線も列に合わせて置き直す）。 */
  const repropose = () => {
    if (!natural || !umPerPx || !detection) return;
    placeForCounting(natural.w, natural.h, umPerPx, detection);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || !natural) return;
    const p = toImagePoint(e);
    if (!p) return;
    if (d.kind === "calib") {
      setCalibLine((cur) => (cur ? { start: cur.start, end: p } : cur));
    } else if (line) {
      if (!d.moved && distancePx(d.start, p) < unit * 2) return; // まだ「押しただけ」の範囲
      d.moved = true;
      setLine(moveLine(line, p.x - d.last.x, p.y - d.last.y, natural.w, natural.h));
      d.last = p;
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.kind === "bar" && !d.moved) togglePoint(d.start);
  };

  const calibPx = calibLine ? distancePx(calibLine.start, calibLine.end) : 0;
  const realMm = Number(realLength.replace(",", "."));
  const calibValue = calibLine ? umPerPxFromLine(calibLine.start, calibLine.end, realMm) : null;

  const applyCalibration = () => {
    if (!natural || !calibValue) return;
    saveCalibration(natural.w, calibValue);
    // 自動で見つけた目盛りの線をそのまま使い、長さだけ直した場合は、
    // 「この機種の目盛りは◯mm」として覚える（次の画像から自動で正しく合う）。
    const usedDetected =
      detected != null &&
      calibLine != null &&
      Math.abs(distancePx(calibLine.start, calibLine.end) - detected.lengthPx) <=
        detected.lengthPx * 0.03;
    if (usedDetected || scaleImageUrl) saveScaleLabelMm(realMm);
    setCalibLine(null);
    if (scaleImageUrl) {
      // 目盛りの画像で合わせた → 観察の画像に戻る（同じ解像度なら、その値が使われる）。
      setNote(null);
      setNatural(null);
      setScaleImageUrl(null);
      return;
    }
    setUmPerPx(calibValue);
    setSource(usedDetected ? "auto_scale" : "manual");
    setNote(null);
    placeForCounting(natural.w, natural.h, calibValue, detection);
    setMode("count");
  };

  const lengthMm = line && umPerPx ? pxToMm(distancePx(line.start, line.end), umPerPx) : null;
  const density = lengthMm != null ? densityPerMm(points.length, lengthMm) : null;
  const measurement = useMemo(
    () =>
      natural && line && umPerPx && !scaleImageUrl
        ? buildMeasurement({
            points,
            line,
            umPerPx,
            calibrationSource: source,
            imageWidthPx: natural.w,
            imageHeightPx: natural.h,
            proposal:
              proposals.length > 0 ? { version: TIP_DETECT_VERSION, points: proposals } : null,
            proposalStored: carriedProposal.current,
            imageQuality: quality ? toStoredQuality(quality) : null,
          })
        : null,
    [natural, line, umPerPx, points, scaleImageUrl, source, proposals, quality],
  );
  const canPropose = Boolean(detection && detection.row && detection.tips.length > 0);
  const advice = quality ? qualityAdvice(quality.issues) : [];
  // 線の端の目印は、線に垂直に引く（線が傾いていても範囲が分かるように）。
  const tick = (() => {
    if (!line) return { x: 0, y: 1 };
    const len = distancePx(line.start, line.end) || 1;
    return { x: -(line.end.y - line.start.y) / len, y: (line.end.x - line.start.x) / len };
  })();

  const pickScaleImage = (file: File | undefined) => {
    if (!file) return;
    setNatural(null);
    setScaleImageUrl(URL.createObjectURL(file));
    setNote("目盛りを撮った画像を開いています。目盛りの端から端までをなぞってください。");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="本数を数える"
      className="fixed inset-0 z-[100] flex flex-col bg-[var(--video-bg)] text-white"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-white/15 px-4 py-3">
        <h2 className="text-xl font-bold">本数を数える</h2>
        {mode === "count" && umPerPx ? (
          <p className="text-lg" aria-live="polite">
            <span className="text-3xl font-bold">{points.length}</span> 本 ／ 範囲{" "}
            {lengthMm != null ? lengthMm.toFixed(2) : "–"} mm
            {density != null && (
              <>
                {" "}
                ＝ <span className="text-3xl font-bold">{density}</span> 本/mm
              </>
            )}
          </p>
        ) : (
          <p className="text-lg">目盛り合わせ</p>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {mode === "count" && (
            <>
              <button
                type="button"
                className={barButton}
                disabled={history.length === 0}
                onClick={undo}
              >
                1つ戻す
              </button>
              <button
                type="button"
                className={barButton}
                disabled={points.length === 0}
                onClick={clearAll}
              >
                すべて消す
              </button>
              {canPropose && (
                <button type="button" className={barButton} onClick={repropose}>
                  {proposals.length > 0 ? "候補を置き直す" : "先端の候補を出す"}
                </button>
              )}
              <button
                type="button"
                className={barButton}
                onClick={() => {
                  // 自動で見つけた目盛りがあれば、その線を最初から引いておく（長さだけ直せる）。
                  setCalibLine(detected ? { start: detected.start, end: detected.end } : null);
                  if (detected) setRealLength(String(loadScaleLabelMm()));
                  setMode("calibrate");
                }}
              >
                目盛りを合わせ直す
              </button>
              <button
                type="button"
                className={primaryBarButton}
                disabled={!measurement}
                onClick={() => measurement && onDone(measurement)}
              >
                この結果を記録する
              </button>
            </>
          )}
          <button type="button" className={barButton} onClick={onClose}>
            やめる
          </button>
        </div>
      </div>

      <div className="border-b border-white/15 px-4 py-2 text-base leading-relaxed">
        {mode === "calibrate" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1">
              画像に写っている目盛り（長さの分かるもの）の端から端までを、なぞってください。合わせた値はこの端末に保存され、同じスコープ・同じ倍率の間は次回から不要です。
            </p>
            <label className="flex items-center gap-2 whitespace-nowrap">
              なぞった長さ
              <input
                aria-label="なぞった長さ（mm）"
                inputMode="decimal"
                value={realLength}
                onChange={(e) => setRealLength(e.target.value)}
                style={{ width: "5rem", minHeight: "2.75rem" }}
                className="rounded border border-white/40 bg-white px-2 text-lg text-[var(--text)]"
              />
              mm
            </label>
            <button
              type="button"
              className={primaryBarButton}
              disabled={!calibValue}
              onClick={applyCalibration}
            >
              この目盛りで決める
            </button>
            {!scaleImageUrl && (
              <label className={`${barButton} flex cursor-pointer items-center`}>
                目盛りを撮った別の画像を使う
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  style={{ width: 1, minHeight: 0, padding: 0 }}
                  onChange={(e) => pickScaleImage(e.target.files?.[0])}
                />
              </label>
            )}
            {umPerPx && !scaleImageUrl && (
              <button type="button" className={barButton} onClick={() => setMode("count")}>
                合わせ直しをやめる
              </button>
            )}
          </div>
        ) : (
          <p>
            {proposals.length > 0
              ? `白い線（${lengthMm != null ? lengthMm.toFixed(2) : "1"} mm）の範囲にある先端の候補を、自動で置きました。合っているか確かめてください。違う点は押すと消え、足りない先端は押すと足せます。点線の丸は範囲の外の候補で、線を動かすと数え直します。`
              : `白い線（${lengthMm != null ? lengthMm.toFixed(2) : "1"} mm）を動かして先端の列に合わせ、線の範囲にあるループの先端を1つずつ押してください。押した点をもう一度押すと消えます。`}
          </p>
        )}
        {note && <p className="mt-1 text-[#ffcf3f]">{note}</p>}
        {mode === "count" && pixelsReadable && !canPropose && !scaleImageUrl && (
          <p className="mt-1 text-[#ffcf3f]">
            この画像では先端の候補を読み取れませんでした。先端を1つずつ押して数えてください。
          </p>
        )}
        {mode === "count" &&
          !scaleImageUrl &&
          advice.map((text) => (
            <p key={text} className="mt-1 text-[#ffcf3f]">
              {text}
            </p>
          ))}
        {mode === "calibrate" && calibLine && calibPx > 0 && !calibValue && (
          <p className="mt-1 text-[#ffcf3f]">線が短すぎるか、長さの値が正しくありません。</p>
        )}
        {mode === "calibrate" && !umPerPx && !scaleImageUrl && natural && (
          <p className="mt-1 text-white/80">
            この画像の大きさ（幅{natural.w}ピクセル）では、まだ目盛りが合わせてありません。
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <div
          className="relative max-h-full max-w-full"
          style={natural ? { aspectRatio: `${natural.w} / ${natural.h}`, height: "100%" } : undefined}
        >
          <img
            src={shownUrl}
            alt="計測する画像"
            onLoad={onImageLoad}
            draggable={false}
            className="block h-full w-full select-none object-contain"
          />
          {natural && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${natural.w} ${natural.h}`}
              className="absolute inset-0 h-full w-full touch-none"
              style={{ cursor: mode === "calibrate" ? "crosshair" : "pointer" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              aria-label={mode === "calibrate" ? "目盛りをなぞる" : "先端を押して数える"}
            >
              {mode === "calibrate" && calibLine && (
                <g pointerEvents="none">
                  <line
                    x1={calibLine.start.x}
                    y1={calibLine.start.y}
                    x2={calibLine.end.x}
                    y2={calibLine.end.y}
                    stroke="#ffcf3f"
                    strokeWidth={unit * 1.2}
                    strokeLinecap="round"
                  />
                  <circle cx={calibLine.start.x} cy={calibLine.start.y} r={unit * 2.2} fill="#ffcf3f" />
                  <circle cx={calibLine.end.x} cy={calibLine.end.y} r={unit * 2.2} fill="#ffcf3f" />
                </g>
              )}
              {mode === "count" && detected && source === "auto_scale" && (
                <line
                  pointerEvents="none"
                  x1={detected.start.x}
                  y1={detected.start.y}
                  x2={detected.end.x}
                  y2={detected.end.y}
                  stroke="#ffcf3f"
                  strokeOpacity="0.9"
                  strokeWidth={unit * 1.4}
                  strokeLinecap="round"
                />
              )}
              {mode === "count" && line && (
                <>
                  <g pointerEvents="none">
                    <line
                      x1={line.start.x}
                      y1={line.start.y}
                      x2={line.end.x}
                      y2={line.end.y}
                      stroke="rgba(0,0,0,0.55)"
                      strokeWidth={unit * 2.2}
                      strokeLinecap="round"
                    />
                    <line
                      x1={line.start.x}
                      y1={line.start.y}
                      x2={line.end.x}
                      y2={line.end.y}
                      stroke="#ffffff"
                      strokeWidth={unit * 1.1}
                      strokeLinecap="round"
                    />
                    {[line.start, line.end].map((p, i) => (
                      <line
                        key={i}
                        x1={p.x - tick.x * unit * 7}
                        y1={p.y - tick.y * unit * 7}
                        x2={p.x + tick.x * unit * 7}
                        y2={p.y + tick.y * unit * 7}
                        stroke="#ffffff"
                        strokeWidth={unit * 1.1}
                      />
                    ))}
                  </g>
                  {/* 線をつかんで動かすための、太い透明の当たり判定 */}
                  <line
                    data-role="bar"
                    x1={line.start.x}
                    y1={line.start.y}
                    x2={line.end.x}
                    y2={line.end.y}
                    stroke="transparent"
                    strokeWidth={unit * 12}
                    style={{ cursor: "grab" }}
                  />
                  <g pointerEvents="none">
                    {idle.map(({ p, index }) => (
                      <circle
                        key={`idle-${index}`}
                        data-testid="idle-tip"
                        cx={p.x}
                        cy={p.y}
                        r={unit * 3.2}
                        fill="rgba(0,0,0,0.15)"
                        stroke="#ffffff"
                        strokeOpacity="0.9"
                        strokeWidth={unit * 0.7}
                        strokeDasharray={`${unit * 1.4} ${unit * 1.2}`}
                      />
                    ))}
                    {points.map((p, i) => (
                      <g key={i}>
                        <circle
                          data-testid="counted-tip"
                          cx={p.x}
                          cy={p.y}
                          r={unit * 3.4}
                          fill="rgba(29,95,168,0.85)"
                          stroke="#ffffff"
                          strokeWidth={unit * 0.8}
                        />
                        <text
                          x={p.x}
                          y={p.y + unit * 1.4}
                          textAnchor="middle"
                          fontSize={unit * 3.8}
                          fontWeight="bold"
                          fill="#ffffff"
                        >
                          {i + 1}
                        </text>
                      </g>
                    ))}
                  </g>
                </>
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

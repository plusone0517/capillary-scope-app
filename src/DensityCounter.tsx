// 本数（密度）を画像の上で数える画面（全画面の重ね表示）。
// 手順：①目盛りを合わせる（最初の一度だけ）→ ②1mm の範囲を先端の列に合わせる
//       → ③範囲の中の先端を押して数える。
// 計算は densityCount.ts。数えた位置も記録に残す。
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildMeasurement,
  defaultLine,
  densityPerMm,
  distancePx,
  loadCalibration,
  moveLine,
  nearestPointIndex,
  pxToMm,
  saveCalibration,
  umPerPxFromLine,
  type DensityMeasurement,
  type Point,
} from "./densityCount";

type Line = { start: Point; end: Point };

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
  const [points, setPoints] = useState<Point[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // 線の上を押したときは、動かしたのか（ドラッグ）、その場を押しただけか（先端の指定）を
  // 指を離すまで決めない。先端は線のすぐ近くにあるため、押しただけなら点として扱う。
  const drag = useRef<{ kind: "calib" | "bar"; last: Point; start: Point; moved: boolean } | null>(
    null,
  );
  const restored = useRef(false);

  // 画像が読めたら、保存済みの記録か、この端末の目盛り合わせを使って準備する。
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    if (scaleImageUrl) {
      setMode("calibrate");
      setCalibLine(null);
      return;
    }
    if (
      !restored.current &&
      initial &&
      initial.imageWidthPx === w &&
      initial.imageHeightPx === h
    ) {
      restored.current = true;
      setUmPerPx(initial.umPerPx);
      setLine({
        start: { x: initial.line.start.x * w, y: initial.line.start.y * h },
        end: { x: initial.line.end.x * w, y: initial.line.end.y * h },
      });
      setPoints(initial.points.map((p) => ({ x: p.x * w, y: p.y * h })));
      setMode("count");
      return;
    }
    restored.current = true;
    const saved = loadCalibration(w);
    if (saved) {
      setUmPerPx(saved);
      setLine((cur) => cur ?? defaultLine(w, h, saved));
      setMode("count");
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

  const togglePoint = (p: Point) => {
    setPoints((cur) => {
      const hit = nearestPointIndex(cur, p, unit * 5);
      return hit >= 0 ? cur.filter((_, i) => i !== hit) : [...cur, p];
    });
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
    setCalibLine(null);
    if (scaleImageUrl) {
      // 目盛りの画像で合わせた → 観察の画像に戻る（同じ解像度なら、その値が使われる）。
      setNote(null);
      setNatural(null);
      setScaleImageUrl(null);
      return;
    }
    setUmPerPx(calibValue);
    setLine(defaultLine(natural.w, natural.h, calibValue));
    setPoints([]);
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
            imageWidthPx: natural.w,
            imageHeightPx: natural.h,
          })
        : null,
    [natural, line, umPerPx, points, scaleImageUrl],
  );

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
                disabled={points.length === 0}
                onClick={() => setPoints(points.slice(0, -1))}
              >
                1つ戻す
              </button>
              <button
                type="button"
                className={barButton}
                disabled={points.length === 0}
                onClick={() => setPoints([])}
              >
                すべて消す
              </button>
              <button
                type="button"
                className={barButton}
                onClick={() => {
                  setCalibLine(null);
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
            白い線（{lengthMm != null ? lengthMm.toFixed(2) : "1"} mm）を動かして先端の列に合わせ、線の範囲にあるループの先端を1つずつ押してください。押した点をもう一度押すと消えます。
          </p>
        )}
        {note && <p className="mt-1 text-[#ffcf3f]">{note}</p>}
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
                        x1={p.x}
                        y1={p.y - unit * 7}
                        x2={p.x}
                        y2={p.y + unit * 7}
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
                    {points.map((p, i) => (
                      <g key={i}>
                        <circle
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

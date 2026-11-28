// 注釈つき画像：元の画像の上に「対象部分を囲む輪＋番号バッジ＋短い
// ラベル」のマーカーを重ね、下に「番号 → 見出し＋コメント」の一覧を
// 出す共通コンポーネント。
//
// 解析結果を「抽出のベタ塗り」や「点だけのマーカー」ではなく、元の画像の
// どの部分を見ているのかが分かる形で示すために使う（AI候補の提示、
// 自動計測の根拠表示）。マーカーを押すと対応する一覧項目へスクロール
// して強調され、一覧項目に触れる／フォーカスすると対応するマーカーが
// 強調される。

import { useRef, useState } from "react";

export type AnnotationItem = {
  /** 項目を一意に識別するキー。 */
  id: string;
  /**
   * マーカーの位置。画像の左上を原点とするパーセント座標
   * （x: 左端0〜右端100、y: 上端0〜下端100）。
   * x か y が null の項目はマーカーを出さず、一覧にだけ出す。
   */
  x: number | null;
  y: number | null;
  /** 臨床フラグ系の項目は赤マーカーにする。 */
  clinical?: boolean;
  /**
   * マーカーの輪の近くに出す短いラベル（例：「蛇行」）。
   * 画像上のマーカーだけでも何を指しているか分かるようにするためのもの。
   * 省略した項目は番号バッジだけのマーカーになる。
   */
  shortLabel?: string;
  /** 一覧の見出し（例：「No.7 蛇行型（AI候補・確からしさ：中）」）。 */
  heading: string;
  /** 一覧のコメント本文（AIの理由など）。 */
  comment?: string;
  /** 「選択中」などの状態チップ。 */
  statusLabel?: string;
  /** 項目末尾の小さな案内文（例：「押すと選択／解除できます。」）。 */
  hint?: string;
  /** 選択済みの見た目にする（AI候補の一覧で使う）。 */
  selected?: boolean;
  /** 一覧項目を押したときの動作。指定がある場合は項目がボタンになる。 */
  onPress?: () => void;
};

type Props = {
  /** 注釈を重ねる元の画像のURL。 */
  imageUrl: string;
  imageAlt: string;
  /** 番号順に並んだ注釈項目。番号は並び順で 1 から振る。 */
  items: AnnotationItem[];
  /** 一覧の見出し（スクリーンリーダー向けのラベルにも使う）。 */
  listLabel: string;
};

/** 番号バッジ／マーカーの色。臨床フラグ系は赤、それ以外は操作色（ブルー）。 */
function markerColorClass(clinical: boolean | undefined): string {
  return clinical ? "bg-[var(--alert)]" : "bg-[var(--accent)]";
}

export function AnnotatedImage({ imageUrl, imageAlt, items, listLabel }: Props) {
  // 強調中の項目（マーカーと一覧の相互ハイライト用）。
  const [activeId, setActiveId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  const activateAndScroll = (id: string) => {
    setActiveId(id);
    itemRefs.current
      .get(id)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <img
          src={imageUrl}
          alt={imageAlt}
          className="block w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--video-bg)]"
        />
        {items.map((item, i) => {
          if (item.x == null || item.y == null) return null;
          const active = activeId === item.id;
          // ラベルが画像の右端からはみ出さないよう、右寄りのマーカーでは
          // バッジとラベルを輪の左側に出す。
          const flip = item.x > 65;
          const ringColor = item.clinical
            ? "border-[var(--alert)]"
            : "border-[var(--accent)]";
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`注釈${i + 1}：${item.heading}`}
              onClick={() => activateAndScroll(item.id)}
              onMouseEnter={() => setActiveId(item.id)}
              onMouseLeave={() => setActiveId(null)}
              onFocus={() => setActiveId(item.id)}
              onBlur={() => setActiveId(null)}
              style={{ left: `${item.x}%`, top: `${item.y}%`, width: "10%" }}
              className={`absolute z-10 aspect-square -translate-x-1/2 -translate-y-1/2 transition-transform ${
                active ? "z-20 scale-110" : ""
              }`}
            >
              {/* 対象部分を囲む輪 */}
              <span
                aria-hidden="true"
                className={`block h-full w-full rounded-full border-[3px] bg-white/10 shadow-[0_2px_10px_rgba(11,37,69,0.45)] ${ringColor} ${
                  active ? "ring-4 ring-white/80" : ""
                }`}
              />
              {/* 番号バッジ（輪の右上／左上） */}
              <span
                aria-hidden="true"
                className={`absolute -top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white shadow-[0_2px_8px_rgba(11,37,69,0.45)] ${markerColorClass(item.clinical)} ${
                  flip ? "-left-2" : "-right-2"
                }`}
              >
                {i + 1}
              </span>
              {/* 短いラベル（バッジの横） */}
              {item.shortLabel && (
                <span
                  aria-hidden="true"
                  className={`absolute -top-2 whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-bold text-white shadow-[0_2px_8px_rgba(11,37,69,0.45)] ${markerColorClass(item.clinical)} ${
                    flip ? "right-full mr-1" : "left-full ml-1"
                  }`}
                >
                  {item.shortLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <ol className="flex flex-col gap-2" aria-label={listLabel}>
        {items.map((item, i) => {
          const active = activeId === item.id;
          const inner = (
            <>
              <span className="flex flex-wrap items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ${markerColorClass(item.clinical)}`}
                >
                  {i + 1}
                </span>
                <span className="text-lg font-bold text-[var(--text)]">
                  {item.heading}
                </span>
                {item.statusLabel && (
                  <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-sm font-bold text-white">
                    {item.statusLabel}
                  </span>
                )}
              </span>
              {item.comment && (
                <span className="text-base leading-relaxed text-[var(--dim)]">
                  {item.comment}
                </span>
              )}
              {item.hint && (
                <span className="text-sm text-[var(--dim)]">{item.hint}</span>
              )}
            </>
          );
          const liClass = `rounded-[var(--radius)] transition-shadow ${
            active ? "ring-2 ring-[var(--accent)] ring-offset-1" : ""
          }`;
          return (
            <li
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el);
                else itemRefs.current.delete(item.id);
              }}
              className={liClass}
              onMouseEnter={() => setActiveId(item.id)}
              onMouseLeave={() => setActiveId(null)}
            >
              {item.onPress ? (
                <button
                  type="button"
                  aria-pressed={item.selected ?? false}
                  onClick={item.onPress}
                  onFocus={() => setActiveId(item.id)}
                  onBlur={() => setActiveId(null)}
                  className={`flex min-h-14 w-full flex-col gap-1 rounded-[var(--radius)] border-2 p-3 text-left ${
                    item.selected
                      ? "border-[var(--accent)] bg-[var(--accent-bg)]"
                      : "border-[var(--border-strong)] bg-[var(--surface)]"
                  }`}
                >
                  {inner}
                </button>
              ) : (
                <div className="flex min-h-14 w-full flex-col gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3">
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

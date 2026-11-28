// AI候補提示（analyzeImagePatterns）のプロンプトに渡すパターン一覧。
// 正本はクライアント側 src/data/capillary-patterns.ts（28種）。
// ここにはコード・名前・形の特徴だけを転記する（プロンプト用に軽くするため）。
// パターンの追加・変更をしたら、こちらにも反映すること。

export interface PatternSummary {
  code: string;
  name: string;
  feature: string;
}

export const PATTERN_SUMMARIES: PatternSummary[] = [
  {
    code: "normal",
    name: "正常",
    feature: "真っ直ぐ伸びたヘアピン状の毛細血管が規則正しく並ぶ。太さ・長さ・間隔がそろった状態。",
  },
  {
    code: "vessel_hardening",
    name: "血管の硬化",
    feature: "ループが太くなり、くねりが出る。",
  },
  {
    code: "microcirculation_onset",
    name: "微小循環障害の始まり",
    feature: "ループの上部が細くなり始めているが、血流は通っている。『瘀血』の始まりとされる形。",
  },
  {
    code: "allergy_prone",
    name: "アレルギー体質",
    feature: "先端部分だけが見え、他はほとんど見えない。",
  },
  {
    code: "liver_decline",
    name: "肝臓機能の低下",
    feature: "ループが短く、低い弧を描く。",
  },
  {
    code: "sugar_excess",
    name: "糖分の摂り過ぎ",
    feature: "広がった血管が多く見られる。",
  },
  {
    code: "lipid_excess",
    name: "脂質の摂り過ぎ",
    feature: "血管が横に広がり、開いた状態。",
  },
  {
    code: "cardiac_decline",
    name: "心臓機能の低下",
    feature: "横に走る毛細血管が見られる状態。",
  },
  {
    code: "hormone_imbalance",
    name: "ホルモンバランスの崩れ",
    feature: "血管から赤血球がにじみ出て見える。",
  },
  {
    code: "tissue_proliferation",
    name: "組織の異常増殖",
    feature: "枝分かれして増えた、木の枝状の形。",
  },
  {
    code: "deformity",
    name: "変形の様々な種類",
    feature: "ループがねじれ、形が崩れた状態。",
  },
  {
    code: "giant",
    name: "巨大毛細血管",
    feature: "ループ全体が異常に太い形（直径50μm以上）。全身性強皮症の早期サイン。",
  },
  {
    code: "hemorrhage",
    name: "微小出血",
    feature: "ループの周囲に茶色い点状の出血。強皮症パターンの初期から活動期に見られる。",
  },
  {
    code: "capillary_loss",
    name: "脱落・ゴースト血管",
    feature: "ループが消えて本数が減り、空白ができる。強皮症の進行期の所見でもある。",
  },
  {
    code: "tortuous",
    name: "蛇行",
    feature: "ループが大きくうねる形。糖尿病や高血圧で報告されるが、健康な人にも出る非特異的変化。",
  },
  {
    code: "congestion",
    name: "うっ血・血流停滞",
    feature: "ループが太く暗く、密集する。",
  },
  {
    code: "renal_decline",
    name: "腎機能の低下",
    feature: "ループが細くまばらで、色も薄い。",
  },
  {
    code: "autoimmune_lupus",
    name: "自己免疫の異常（ループス型）",
    feature: "ループが長く伸び、強く蛇行する。全身性エリテマトーデスなど膠原病で見られる形。",
  },
  {
    code: "inflammation",
    name: "炎症が強いとき",
    feature: "ループが広がり、周囲がにじんで見える。体の中で炎症が起きているときの反応。",
  },
  {
    code: "anemia",
    name: "貧血・血の薄さ",
    feature: "ループが淡く細く見える。流れる血液そのものの色が薄い状態。",
  },
  {
    code: "crossing",
    name: "交差型",
    feature: "隣り合うループ同士が途中で交わり、X字にクロスして見える形。爪郭カピラロスコピーで数えられる基本の形のひとつ。",
  },
  {
    code: "dilated_loop",
    name: "拡張型",
    feature: "ループ全体が均一に太くなった形。一部だけが膨らむ巨大毛細血管とは違い、ループの幅がそろって広い。",
  },
  {
    code: "corkscrew",
    name: "コルクスクリュー型",
    feature: "ループが細かくらせん状にねじれた形。コルク抜きのように、短い間隔で巻きながら伸びる。",
  },
  {
    code: "glomerular",
    name: "糸球体様",
    feature: "短い茎の先に、血管がぐるぐると巻いた塊が乗った形。糸玉のように見える。",
  },
  {
    code: "comma",
    name: "コンマ型",
    feature: "短いループが「、」のように軽く曲がったフック状の形。高さが低く、そろって並ぶことが多い。",
  },
  {
    code: "branching_neo",
    name: "分岐・新生血管型",
    feature: "1本のループの途中から枝が出て、樹の枝のように分かれる形。枝分かれが増えると目立つ。",
  },
  {
    code: "disarray",
    name: "配列の乱れ型",
    feature: "ループの高さ・向き・間隔がばらばらで、並びの規則性が失われた形。視野全体の整い具合で見比べる。",
  },
  {
    code: "elongated",
    name: "伸長型",
    feature: "ループが通常より縦に長く伸びた形。太さは目立たず、長さ（高さ）がそろって目立つ。",
  },
];

export const PATTERN_CODE_SET: ReadonlySet<string> = new Set(
  PATTERN_SUMMARIES.map((p) => p.code),
);

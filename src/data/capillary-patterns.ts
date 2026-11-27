// 毛細血管観察の形パターン定義（20種）。
//
// 移植元: ルーツマイル側ローカル実装
//   ~/workspace/roots-mile-dev/capillary/packages/core/capillary-patterns.ts
// 20種の名前・特徴・「なぜその形になるか」は、参照パターン図
// `capillary-patterns-chart-2026-11-27.svg`（2026-11-27作成）を正本として
// 転記したもの。パターンは断定ではなく「最も近い形」として記録する
// （撮影と記録の型 4節）。
//
// アドバイス文面はユーザー確認待ちのため、ここには含めない。
// 文面が決まったら別定義として追加する。

export type CapillaryPattern = {
  /** プロトコル資料の20種に対応する英語スラッグ。Firestore の patterns[] に保存する値。 */
  code: string;
  name: string;
  /** 形の特徴（パターン図の説明文）。 */
  feature: string;
  /** なぜその形になるか（パターン図の過程説明）。 */
  why: string;
  /**
   * 臨床フラグ（巨大・微小出血・脱落・分枝）に対応するパターンか。
   * パターン図の注記「巨大毛細血管・微小出血・脱落・分枝は、全身性強皮症の
   * 所見として臨床の診断補助に使われています」に基づく。
   */
  clinical: boolean;
};

export const capillaryPatterns: CapillaryPattern[] = [
  {
    code: "normal",
    name: "正常",
    feature: "真っ直ぐ伸びたヘアピン状の毛細血管が規則正しく並ぶ。太さ・長さ・間隔がそろった状態。",
    why: "内皮・基底膜・周細胞がそろい、血圧と流量が安定しているため、ループの太さと長さが均一に保たれる。",
    clinical: false,
  },
  {
    code: "vessel_hardening",
    name: "血管の硬化",
    feature: "ループが太くなり、くねりが出る。肩こり・頭痛・腰の重さと重なりやすい形。",
    why: "壁に脂質がたまって厚く硬くなり、内腔が狭まる。流れの抵抗が上がり、弾力を失った部分から太くなり、くねる。",
    clinical: false,
  },
  {
    code: "microcirculation_onset",
    name: "微小循環障害の始まり",
    feature: "ループの上部が細くなり始めているが、血流は通っている。『瘀血』の始まりとされる形。",
    why: "血流が落ちると、最も遠いループの先端まで圧が届きにくくなる。血液の粘りも加わり、先端から細く見えるようになる。",
    clinical: false,
  },
  {
    code: "allergy_prone",
    name: "アレルギー体質",
    feature: "先端部分だけが見え、他はほとんど見えない。今後アレルギー症状が出る可能性がある。",
    why: "アレルギー反応でヒスタミンが出て血管の透過性が上がり、爪郭部が浮腫んで濁る。血管が組織に隠れ、先端だけ見える。",
    clinical: false,
  },
  {
    code: "liver_decline",
    name: "肝臓機能の低下",
    feature: "ループが短く、低い弧を描く。飲酒・脂肪肝など肝臓の負担が大きい人で見られやすい。",
    why: "肝臓は血漿タンパクを作り血液の性状を保つ場所。機能が落ちると末梢の血の勢いが弱まり、ループが伸びきらない。",
    clinical: false,
  },
  {
    code: "sugar_excess",
    name: "糖分の摂り過ぎ",
    feature: "広がった血管が多く見られる。肥満や内臓脂肪の背景と重なり、糖尿病との関連も研究中。",
    why: "高血糖で血が粘り、糖化で基底膜が厚くなって内腔が狭まる。流れを保とうと手前の血管が圧で広がる。",
    clinical: false,
  },
  {
    code: "lipid_excess",
    name: "脂質の摂り過ぎ",
    feature: "血管が横に広がり、開いた状態。中性脂肪やコレステロールが高い人に多く見られる。",
    why: "脂質の多い血は粘りが強く、壁にも脂質がついて内腔が狭まる。行き場のない血で血管が横に広がり、開いて見える。",
    clinical: false,
  },
  {
    code: "cardiac_decline",
    name: "心臓機能の低下",
    feature: "横に走る毛細血管が見られる状態。心臓に負担がかかっているとされる形。",
    why: "心臓が血を戻す力が弱いと静脈側に血が滞る。末梢の圧が上がり、迂回路となる横の血管が拡張して目立つようになる。",
    clinical: false,
  },
  {
    code: "hormone_imbalance",
    name: "ホルモンバランスの崩れ",
    feature: "血管から赤血球がにじみ出て見える。血管壁の傷みが背景にあるとされる形。",
    why: "ホルモンは血管壁の透過性や収縮を調整する。バランスが崩れると壁のすき間が開き、赤血球がすり抜けてにじむ。",
    clinical: false,
  },
  {
    code: "tissue_proliferation",
    name: "組織の異常増殖",
    feature: "枝分かれして増えた、木の枝状の形。強皮症の晩期所見とも重なる。",
    why: "炎症や増殖した組織は酸素を大量に必要とし、血管を増やす信号（VEGF）を出す。既存の血管から芽が出て枝分かれする。",
    clinical: true, // 臨床フラグ「分枝」に対応する形。
  },
  {
    code: "deformity",
    name: "変形の様々な種類",
    feature: "ループがねじれ、形が崩れた状態。ストレスや食習慣の乱れが続いた人に見られやすい。",
    why: "老化や酸化ストレスで壁の弾性線維が傷む。均一に伸び縮みできなくなり、血圧に押されて弱い部分からねじれる。",
    clinical: false,
  },
  {
    code: "giant",
    name: "巨大毛細血管",
    feature: "ループ全体が異常に太い形（直径50μm以上）。全身性強皮症の早期サイン。",
    why: "免疫の異常で内皮が傷み、壁が薄く弱くなる。内側からの血圧に耐えられず、風船のように膨らんで巨大なループになる。",
    clinical: true,
  },
  {
    code: "hemorrhage",
    name: "微小出血",
    feature: "ループの周囲に茶色い点状の出血。強皮症パターンの初期から活動期に見られる。",
    why: "傷んで弱くなった壁に小さな裂け目ができ、赤血球が外へ漏れる。漏れた赤血球が分解され、色素が茶色い点で残る。",
    clinical: true,
  },
  {
    code: "capillary_loss",
    name: "脱落・ゴースト血管",
    feature: "ループが消えて本数が減り、空白ができる。強皮症の進行期の所見でもある。",
    why: "内皮の傷みが進み、血が通わなくなったループは使われない血管として退縮し、消えていく。空白の範囲が広がる。",
    clinical: true,
  },
  {
    code: "tortuous",
    name: "蛇行",
    feature: "ループが大きくうねる形。糖尿病や高血圧で報告されるが、健康な人にも出る非特異的変化。",
    why: "高い血圧が続くと血管は長さ方向に伸びていく。皮膚の中で収まりきらず、余った長さがうねりになる。",
    clinical: false,
  },
  {
    code: "congestion",
    name: "うっ血・血流停滞",
    feature: "ループが太く暗く、密集する。冷え・むくみ・肩こりの訴えと重なりやすい形。",
    why: "静脈側の戻りが悪いと、毛細血管に血がたまり込んで押し広げられる。たまった血は酸素が少なく、暗く太く見える。",
    clinical: false,
  },
  {
    code: "renal_decline",
    name: "腎機能の低下",
    feature: "ループが細くまばらで、色も薄い。慢性腎臓病や透析中の人で密度の低下が報告される。",
    why: "腎臓は赤血球作りを指示するホルモンを出す。機能が落ちると貧血で色が薄くなり、尿毒素や高血圧で内皮も傷む。",
    clinical: false,
  },
  {
    code: "autoimmune_lupus",
    name: "自己免疫の異常（ループス型）",
    feature: "ループが長く伸び、強く蛇行する。全身性エリテマトーデスなど膠原病で見られる形。",
    why: "免疫が自分の血管を攻撃して内皮が傷む。炎症が続くと血管が伸びて蛇行し、出血や脱落が混ざることもある。",
    clinical: false,
  },
  {
    code: "inflammation",
    name: "炎症が強いとき",
    feature: "ループが広がり、周囲がにじんで見える。体の中で炎症が起きているときの反応。",
    why: "炎症が起きると、免疫細胞を集めるために血管が広がり、透過性が上がって血漿が漏れ、周囲がにじむ。",
    clinical: false,
  },
  {
    code: "anemia",
    name: "貧血・血の薄さ",
    feature: "ループが淡く細く見える。流れる血液そのものの色が薄い状態。鉄不足でも起こる。",
    why: "赤血球が減ると、毛細血管の中を流れる血の色が薄くなる。腎機能の低下や鉄不足が背景にあることが多い。",
    clinical: false,
  },
];

export const capillaryPatternCodes: string[] = capillaryPatterns.map(pattern => pattern.code);

export const capillaryPatternByCode: Record<string, CapillaryPattern> =
  Object.fromEntries(capillaryPatterns.map(pattern => [pattern.code, pattern]));

export function isCapillaryPatternCode(value: unknown): value is string {
  return typeof value === "string" && value in capillaryPatternByCode;
}

/** 撮影する指。標準は利き手と逆の薬指（撮影と記録の型 1節）。値は Firestore の finger に保存する。 */
export const capillaryFingers = [
  { code: "left_thumb", label: "左手・親指" },
  { code: "left_index", label: "左手・人差し指" },
  { code: "left_middle", label: "左手・中指" },
  { code: "left_ring", label: "左手・薬指" },
  { code: "left_little", label: "左手・小指" },
  { code: "right_thumb", label: "右手・親指" },
  { code: "right_index", label: "右手・人差し指" },
  { code: "right_middle", label: "右手・中指" },
  { code: "right_ring", label: "右手・薬指" },
  { code: "right_little", label: "右手・小指" },
] as const;
export const capillaryFingerCodes: string[] = capillaryFingers.map(finger => finger.code);
export const capillaryFingerLabels: Record<string, string> =
  Object.fromEntries(capillaryFingers.map(finger => [finger.code, finger.label]));

export const capillaryFlowImpressions = [
  { code: "good", label: "良好" },
  { code: "slow", label: "やや遅い" },
  { code: "stagnant", label: "停滞" },
] as const;
export const capillaryFlowCodes: string[] = capillaryFlowImpressions.map(item => item.code);
export const capillaryFlowLabels: Record<string, string> =
  Object.fromEntries(capillaryFlowImpressions.map(item => [item.code, item.label]));

export const capillaryColorImpressions = [
  { code: "bright_red", label: "鮮赤" },
  { code: "dark_red", label: "暗赤" },
  { code: "pale", label: "淡い" },
] as const;
export const capillaryColorCodes: string[] = capillaryColorImpressions.map(item => item.code);
export const capillaryColorLabels: Record<string, string> =
  Object.fromEntries(capillaryColorImpressions.map(item => [item.code, item.label]));

export const capillaryChangeOptions = [
  { code: "improved", label: "改善" },
  { code: "same", label: "不変" },
  { code: "worse", label: "悪化" },
] as const;
export const capillaryChangeCodes: string[] = capillaryChangeOptions.map(item => item.code);
export const capillaryChangeLabels: Record<string, string> =
  Object.fromEntries(capillaryChangeOptions.map(item => [item.code, item.label]));

/** 臨床フラグ4項目（撮影と記録の型 3節）。clinicalFlags のキーと対応する。 */
export const capillaryClinicalFlagLabels: Record<string, string> = {
  giant: "巨大毛細血管あり",
  hemorrhage: "微小出血あり",
  loss: "脱落・無血管野あり",
  ramified: "分枝あり",
};
export const capillaryClinicalFlagKeys = ["giant", "hemorrhage", "loss", "ramified"] as const;

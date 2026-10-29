/* ==========================================================================
   COSTUME ATLAS — tag vocabulary
   Source keywords are English single words. This file gives every keyword a
   Chinese / English / Japanese label and groups them into filter buckets.
   Shared by the page (browser) and scripts/import-costumes.mjs (node).
   ========================================================================== */

export const TAG_NAMES = {
  bag: { zh: '包袋', en: 'Bag', ja: 'バッグ' },
  mini: { zh: '迷你', en: 'Mini', ja: 'ミニ' },
  black: { zh: '黑色', en: 'Black', ja: '黒' },
  skirt: { zh: '半身裙', en: 'Skirt', ja: 'スカート' },
  knit: { zh: '针织', en: 'Knit', ja: 'ニット' },
  dress: { zh: '连衣裙', en: 'Dress', ja: 'ワンピース' },
  boots: { zh: '靴子', en: 'Boots', ja: 'ブーツ' },
  socks: { zh: '袜子', en: 'Socks', ja: '靴下' },
  lace: { zh: '蕾丝', en: 'Lace', ja: 'レース' },
  white: { zh: '白色', en: 'White', ja: '白' },
  ribbon: { zh: '蝴蝶结', en: 'Ribbon', ja: 'リボン' },
  sandals: { zh: '凉鞋', en: 'Sandals', ja: 'サンダル' },
  leather: { zh: '皮革', en: 'Leather', ja: 'レザー' },
  stockings: { zh: '丝袜', en: 'Stockings', ja: 'ストッキング' },
  brown: { zh: '棕色', en: 'Brown', ja: 'ブラウン' },
  camisole: { zh: '吊带', en: 'Camisole', ja: 'キャミソール' },
  tights: { zh: '连裤袜', en: 'Tights', ja: 'タイツ' },
  cardigan: { zh: '开衫', en: 'Cardigan', ja: 'カーディガン' },
  necklace: { zh: '项链', en: 'Necklace', ja: 'ネックレス' },
  ivory: { zh: '象牙白', en: 'Ivory', ja: 'アイボリー' },
  satin: { zh: '缎面', en: 'Satin', ja: 'サテン' },
  pants: { zh: '长裤', en: 'Pants', ja: 'パンツ' },
  jacket: { zh: '夹克', en: 'Jacket', ja: 'ジャケット' },
  heels: { zh: '高跟鞋', en: 'Heels', ja: 'ヒール' },
  shorts: { zh: '短裤', en: 'Shorts', ja: 'ショートパンツ' },
  beige: { zh: '米色', en: 'Beige', ja: 'ベージュ' },
  grey: { zh: '灰色', en: 'Grey', ja: 'グレー' },
  denim: { zh: '牛仔', en: 'Denim', ja: 'デニム' },
  pleated: { zh: '百褶', en: 'Pleated', ja: 'プリーツ' },
  red: { zh: '红色', en: 'Red', ja: 'レッド' },
  gold: { zh: '金色', en: 'Gold', ja: 'ゴールド' },
  blue: { zh: '蓝色', en: 'Blue', ja: 'ブルー' },
  shirt: { zh: '衬衫', en: 'Shirt', ja: 'シャツ' },
  fur: { zh: '毛皮', en: 'Fur', ja: 'ファー' },
  navy: { zh: '藏青', en: 'Navy', ja: 'ネイビー' },
  silver: { zh: '银色', en: 'Silver', ja: 'シルバー' },
  frill: { zh: '荷叶边', en: 'Frill', ja: 'フリル' },
  choker: { zh: '颈饰', en: 'Choker', ja: 'チョーカー' },
  midi: { zh: '中长', en: 'Midi', ja: 'ミディ' },
  coat: { zh: '大衣', en: 'Coat', ja: 'コート' },
  bra: { zh: '文胸', en: 'Bra', ja: 'ブラ' },
  briefs: { zh: '内裤', en: 'Briefs', ja: 'ショーツ' },
  pink: { zh: '粉色', en: 'Pink', ja: 'ピンク' },
  sneakers: { zh: '运动鞋', en: 'Sneakers', ja: 'スニーカー' },
  suede: { zh: '麂皮', en: 'Suede', ja: 'スエード' },
  green: { zh: '绿色', en: 'Green', ja: 'グリーン' },
  blouse: { zh: '女式衬衫', en: 'Blouse', ja: 'ブラウス' },
  tote: { zh: '托特包', en: 'Tote', ja: 'トート' },
  loafers: { zh: '乐福鞋', en: 'Loafers', ja: 'ローファー' },
  belt: { zh: '腰带', en: 'Belt', ja: 'ベルト' },
  mint: { zh: '薄荷绿', en: 'Mint', ja: 'ミント' },
  hat: { zh: '帽子', en: 'Hat', ja: 'ハット' },
  jeans: { zh: '牛仔裤', en: 'Jeans', ja: 'ジーンズ' },
  wool: { zh: '羊毛', en: 'Wool', ja: 'ウール' },
  cream: { zh: '奶油色', en: 'Cream', ja: 'クリーム' },
  headband: { zh: '发带', en: 'Headband', ja: 'ヘアバンド' },
  floral: { zh: '碎花', en: 'Floral', ja: '花柄' },
  corset: { zh: '束腰', en: 'Corset', ja: 'コルセット' },
  velvet: { zh: '天鹅绒', en: 'Velvet', ja: 'ベルベット' },
  pumps: { zh: '单鞋', en: 'Pumps', ja: 'パンプス' },
  gloves: { zh: '手套', en: 'Gloves', ja: '手袋' },
  turtleneck: { zh: '高领', en: 'Turtleneck', ja: 'タートルネック' },
  sunglasses: { zh: '墨镜', en: 'Sunglasses', ja: 'サングラス' },
  yellow: { zh: '黄色', en: 'Yellow', ja: 'イエロー' },
  khaki: { zh: '卡其', en: 'Khaki', ja: 'カーキ' },
  burgundy: { zh: '酒红', en: 'Burgundy', ja: 'バーガンディ' },
  orange: { zh: '橙色', en: 'Orange', ja: 'オレンジ' },
  corduroy: { zh: '灯芯绒', en: 'Corduroy', ja: 'コーデュロイ' },
  scarf: { zh: '围巾', en: 'Scarf', ja: 'スカーフ' },
  robe: { zh: '长袍', en: 'Robe', ja: 'ローブ' },
  swimsuit: { zh: '泳装', en: 'Swimsuit', ja: '水着' },
  sweater: { zh: '毛衣', en: 'Sweater', ja: 'セーター' },
  chiffon: { zh: '雪纺', en: 'Chiffon', ja: 'シフォン' },
  olive: { zh: '橄榄绿', en: 'Olive', ja: 'オリーブ' },
  tulle: { zh: '薄纱', en: 'Tulle', ja: 'チュール' },
  mesh: { zh: '网纱', en: 'Mesh', ja: 'メッシュ' },
  beret: { zh: '贝雷帽', en: 'Beret', ja: 'ベレー帽' },
  vest: { zh: '马甲', en: 'Vest', ja: 'ベスト' },
  hoodie: { zh: '连帽衫', en: 'Hoodie', ja: 'パーカー' },
  apron: { zh: '围裙', en: 'Apron', ja: 'エプロン' },
  maxi: { zh: '及踝', en: 'Maxi', ja: 'マキシ' },
  'polka-dot': { zh: '波点', en: 'Polka dot', ja: 'ドット' },
  lavender: { zh: '薰衣草紫', en: 'Lavender', ja: 'ラベンダー' },
  beanie: { zh: '针织帽', en: 'Beanie', ja: 'ニット帽' },
  muffler: { zh: '厚围巾', en: 'Muffler', ja: 'マフラー' },
  purple: { zh: '紫色', en: 'Purple', ja: 'パープル' },
};

/* 色系 — 顺序即下拉框顺序 */
export const COLOR_TAGS = [
  'black', 'white', 'ivory', 'cream', 'beige', 'brown', 'grey',
  'red', 'burgundy', 'pink', 'lavender', 'purple',
  'blue', 'navy', 'mint', 'green', 'olive', 'khaki',
  'yellow', 'orange', 'gold', 'silver',
];

/* 品类 — 顺序即优先级：一件衣装归入第一个命中的品类 */
export const GROUPS = [
  { key: 'dress', names: { zh: '连衣裙', en: 'Dress', ja: 'ワンピース' }, tags: ['dress'] },
  { key: 'skirt', names: { zh: '半身裙', en: 'Skirt', ja: 'スカート' }, tags: ['skirt'] },
  { key: 'outer', names: { zh: '外套', en: 'Outerwear', ja: 'アウター' }, tags: ['coat', 'jacket', 'robe'] },
  { key: 'top', names: { zh: '上装', en: 'Top', ja: 'トップス' }, tags: ['knit', 'sweater', 'cardigan', 'blouse', 'shirt', 'camisole', 'turtleneck', 'hoodie', 'vest', 'corset'] },
  { key: 'bottom', names: { zh: '下装', en: 'Bottom', ja: 'ボトムス' }, tags: ['pants', 'jeans', 'shorts'] },
  { key: 'inner', names: { zh: '内衣', en: 'Lingerie', ja: 'ランジェリー' }, tags: ['bra', 'briefs'] },
  { key: 'swim', names: { zh: '泳装', en: 'Swimwear', ja: '水着' }, tags: ['swimsuit'] },
  { key: 'shoes', names: { zh: '鞋履', en: 'Shoes', ja: 'シューズ' }, tags: ['boots', 'heels', 'pumps', 'loafers', 'sneakers', 'sandals'] },
  { key: 'hosiery', names: { zh: '袜类', en: 'Hosiery', ja: 'レッグウェア' }, tags: ['stockings', 'tights', 'socks'] },
  { key: 'bag', names: { zh: '包袋', en: 'Bag', ja: 'バッグ' }, tags: ['bag', 'tote'] },
  { key: 'accessory', names: { zh: '配饰', en: 'Accessory', ja: 'アクセサリー' }, tags: ['necklace', 'choker', 'belt', 'hat', 'beret', 'beanie', 'headband', 'gloves', 'sunglasses', 'scarf', 'muffler', 'ribbon', 'apron'] },
];

const GROUP_BY_TAG = new Map();
for (const group of GROUPS) {
  for (const tag of group.tags) GROUP_BY_TAG.set(tag, group.key);
}

const COLOR_SET = new Set(COLOR_TAGS);

export function tagName(tag, lang) {
  return TAG_NAMES[tag]?.[lang] ?? tag;
}

/* 主品类：按 GROUPS 优先级取第一个命中的标签 */
export function primaryTag(tags) {
  return tags.find((tag) => GROUP_BY_TAG.has(tag)) ?? tags[0] ?? '';
}

export function groupOf(tags) {
  const hit = tags.find((tag) => GROUP_BY_TAG.has(tag));
  return hit ? GROUP_BY_TAG.get(hit) : 'other';
}

export function colorOf(tags) {
  return tags.find((tag) => COLOR_SET.has(tag)) ?? '';
}

#!/usr/bin/env node
/**
 * Builds data/poses.json from the public Chinese mirror plus the original
 * Japanese records, adding our own English names and a stable schema.
 *
 * Inputs (not shipped):
 *   scripts/source/pose-zh.json  Chinese-translated records
 *   scripts/source/pose.json     Original Japanese records
 *   scripts/en-pose-names.json  English pose names maintained by this project
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

const SERIES = [
  {
    key: 'full_sexy',
    zh: '全身单人・性感系',
    en: 'Full-body solo · Sexy',
    ja: '全身1人・セクシー系',
    short: { zh: '性感全身', en: 'Sexy', ja: 'セクシー系' },
  },
  {
    key: 'full_std',
    zh: '全身单人・标准系',
    en: 'Full-body solo · Standard',
    ja: '全身1人・標準系',
    short: { zh: '标准全身', en: 'Standard', ja: '標準系' },
  },
  {
    key: 'upper',
    zh: '上半身单人',
    en: 'Upper-body solo',
    ja: '上半身1人',
    short: { zh: '上半身', en: 'Upper body', ja: '上半身' },
  },
  {
    key: 'duo',
    zh: '双人缠绵',
    en: 'Couples',
    ja: '2人絡み',
    short: { zh: '双人', en: 'Couples', ja: 'ペア' },
  },
];

const ANGLES = [
  { key: 'front', zh: '正面', en: 'Front', ja: '正面' },
  { key: 'high', zh: '俯视', en: 'High angle', ja: '上から' },
  { key: 'low', zh: '仰视', en: 'Low angle', ja: '下から' },
  { key: 'side', zh: '侧面', en: 'Side', ja: '横' },
  { key: 'diagonal', zh: '斜侧', en: 'Three-quarter', ja: '斜め' },
];

const CATEGORY_EN = {
  站姿: 'Standing',
  坐姿: 'Sitting',
  '跪立・四肢着地': 'Kneeling / All fours',
  趴卧: 'Prone',
  特殊: 'Special',
  '侧坐・女孩坐': 'Side sit / W-sit',
  前倾: 'Leaning forward',
  '后仰・挺背': 'Leaning back / Arched',
  扭身: 'Twisting',
  跪立: 'Kneeling',
  蹲姿: 'Squatting',
  可爱系: 'Cute',
  '性感・大胆系': 'Sexy / Bold',
  '挤胸・强调事业线系': 'Cleavage emphasis',
  侧卧位: 'Side-lying',
  后入位: 'From behind',
  坐位: 'Sitting position',
  坐位贴身: 'Seated, close',
  '正常位（传教士）': 'Missionary',
  立位: 'Standing position',
  立位贴身: 'Standing, close',
  背向坐位: 'Reverse sitting',
  贴脸系: 'Face to face',
  贴身: 'Close contact',
  面对面坐位: 'Face-to-face sitting',
  骑乘位: 'Cowgirl',
};

const angleByZh = new Map(ANGLES.map((angle) => [angle.zh, angle.key]));
const angleByKey = new Map(ANGLES.map((angle) => [angle.key, angle]));
const seriesByZh = new Map(SERIES.map((series) => [series.zh, series]));
const angleOrder = new Map(ANGLES.map((angle, index) => [angle.key, index]));
const seriesOrder = new Map(SERIES.map((series, index) => [series.key, index]));

const zhRows = JSON.parse(await read('scripts', 'source', 'pose-zh.json'));
const jaRows = JSON.parse(await read('scripts', 'source', 'pose.json'));
const enNames = JSON.parse(await read('scripts', 'en-pose-names.json'));

const jaById = new Map(jaRows.map((row) => [row.id, row]));
const poses = new Map();
const categoryJa = new Map();
const categoryOrder = [];
const categorySeries = new Map();
const errors = [];

for (const row of zhRows) {
  const ja = jaById.get(row.id);
  if (!ja) {
    errors.push(`Missing Japanese record for ${row.id}`);
    continue;
  }

  const series = seriesByZh.get(row['体系']);
  const angleKey = angleByZh.get(row['角度']);
  if (!series) errors.push(`Unknown series: ${row['体系']}`);
  if (!angleKey) errors.push(`Unknown angle: ${row['角度']}`);
  if (!series || !angleKey) continue;

  if (!categoryJa.has(row['分类'])) {
    categoryJa.set(row['分类'], ja['分類']);
    categoryOrder.push(row['分类']);
  } else if (categoryJa.get(row['分类']) !== ja['分類']) {
    errors.push(`Inconsistent JA category for ${row['分类']}: ${ja['分類']}`);
  }

  if (!categorySeries.has(row['分类'])) categorySeries.set(row['分类'], new Set());
  categorySeries.get(row['分类']).add(series.key);

  const angleJa = angleByKey.get(angleKey).ja;
  if (ja['アングル'] !== angleJa) {
    errors.push(`Angle mismatch for ${row.id}: ${ja['アングル']} vs ${angleJa}`);
  }

  const poseId = row.id.replace(/_(?:front|high|low|side|diag)$/, '');
  let pose = poses.get(poseId);
  if (!pose) {
    pose = {
      id: poseId,
      series: series.key,
      category: row['分类'],
      no: row['姿势编号'],
      names: { zh: row['姿势名称'], en: enNames[poseId] ?? '', ja: ja['ポーズ名'] },
      variants: [],
    };
    poses.set(poseId, pose);
  }

  if (pose.names.ja !== ja['ポーズ名']) {
    errors.push(`Inconsistent JA name for ${poseId}`);
  }

  pose.variants.push({
    angle: angleKey,
    thumb: row['缩略图'],
    full: row['原图'],
  });
}

if (errors.length) {
  console.error(errors.slice(0, 20).join('\n'));
  throw new Error(`${errors.length} data consistency errors`);
}

const list = [...poses.values()];
for (const pose of list) {
  pose.variants.sort((a, b) => angleOrder.get(a.angle) - angleOrder.get(b.angle));
  if (!pose.names.en) errors.push(`Missing English name: ${pose.id}`);
  if (!pose.names.zh || !pose.names.ja) errors.push(`Missing CJK name: ${pose.id}`);
}

for (const pose of list) {
  if (!pose.variants.some((variant) => variant.angle === 'front')) {
    console.warn(`No front view: ${pose.id}`);
  }
}

const missingEn = list.filter((pose) => !enNames[pose.id]);
if (missingEn.length) {
  throw new Error(
    `Missing English translations for ${missingEn.length} poses: ${missingEn.map((pose) => pose.id).join(', ')}`
  );
}
const extraEn = Object.keys(enNames).filter((key) => !poses.has(key));
if (extraEn.length) {
  throw new Error(`English names without a pose: ${extraEn.join(', ')}`);
}

list.sort(
  (a, b) =>
    seriesOrder.get(a.series) - seriesOrder.get(b.series) ||
    a.no.localeCompare(b.no, undefined, { numeric: true })
);

const seriesOut = SERIES.map((series) => {
  const own = list.filter((pose) => pose.series === series.key);
  return {
    key: series.key,
    names: { zh: series.zh, en: series.en, ja: series.ja },
    short: series.short,
    poseCount: own.length,
    imageCount: own.reduce((total, pose) => total + pose.variants.length, 0),
  };
});

const categories = categoryOrder.map((key) => {
  const en = CATEGORY_EN[key];
  if (!en) errors.push(`Missing English category: ${key}`);
  return {
    key,
    names: { zh: key, en: en ?? key, ja: categoryJa.get(key) ?? key },
  };
});

if (errors.length) {
  console.error(errors.slice(0, 20).join('\n'));
  throw new Error(`${errors.length} translation errors`);
}

const categoriesBySeries = Object.fromEntries(
  seriesOut.map((series) => [
    series.key,
    categories
      .filter((category) => categorySeries.get(category.key)?.has(series.key))
      .map((category) => category.key),
  ])
);

const payload = {
  schema: 3,
  generatedAt: new Date().toISOString().slice(0, 10),
  source:
    'POSE-DB-01 by giaaibusi; English names maintained by RuiC-PoseAtlas',
  languages: ['zh', 'en', 'ja'],
  totals: {
    poses: list.length,
    images: list.reduce((total, pose) => total + pose.variants.length, 0),
    series: seriesOut.length,
  },
  angles: ANGLES.map(({ key, zh, en, ja }) => ({ key, names: { zh, en, ja } })),
  series: seriesOut,
  categories,
  categoriesBySeries,
  poses: list,
};

const outPath = path.join(root, 'data', 'poses.json');
await writeFile(outPath, JSON.stringify(payload), 'utf8');
console.log(
  `Wrote ${outPath}: ${payload.totals.poses} poses, ${payload.totals.images} images, ` +
  `${payload.categories.length} categories, ${(JSON.stringify(payload).length / 1024).toFixed(0)} KB`
);

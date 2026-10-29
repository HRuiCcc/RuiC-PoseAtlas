#!/usr/bin/env node
/* ==========================================================================
   Build data/costumes.json from the COSTUME-DB-01 snapshot.

   Input  : scripts/source/costume.json  (raw rows as published by the source)
   Output : data/costumes.json           (normalised, trilingual, filter-ready)

   Usage  : node scripts/import-costumes.mjs
   ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GROUPS,
  COLOR_TAGS,
  groupOf,
  colorOf,
  primaryTag,
} from '../assets/js/costume-tags.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CATEGORIES = [
  { source: '春', key: 'spring', names: { zh: '春', en: 'Spring', ja: '春' } },
  { source: '夏', key: 'summer', names: { zh: '夏', en: 'Summer', ja: '夏' } },
  { source: '秋', key: 'autumn', names: { zh: '秋', en: 'Autumn', ja: '秋' } },
  { source: '冬', key: 'winter', names: { zh: '冬', en: 'Winter', ja: '冬' } },
  { source: 'ランジェリー', key: 'lingerie', names: { zh: '内衣', en: 'Lingerie', ja: 'ランジェリー' } },
  { source: 'パーティ', key: 'party', names: { zh: '派对', en: 'Party', ja: 'パーティー' } },
  { source: '水着', key: 'swimwear', names: { zh: '泳装', en: 'Swimwear', ja: '水着' } },
  { source: 'セクシー', key: 'sexy', names: { zh: '性感', en: 'Sexy', ja: 'セクシー' } },
];

const CATEGORY_BY_SOURCE = new Map(CATEGORIES.map((item) => [item.source, item.key]));

const rows = JSON.parse(readFileSync(resolve(ROOT, 'scripts/source/costume.json'), 'utf8'));

const counts = new Map(CATEGORIES.map((item) => [item.key, 0]));
const groupCounts = new Map(GROUPS.map((group) => [group.key, 0]));
groupCounts.set('other', 0);
const colorCounts = new Map(COLOR_TAGS.map((tag) => [tag, 0]));

const costumes = rows.map((row) => {
  const id = String(row.id).trim();
  const category = CATEGORY_BY_SOURCE.get(row['カテゴリ']);
  if (!category) throw new Error(`unknown category "${row['カテゴリ']}" on ${id}`);

  const tags = String(row['キーワード'] ?? '')
    .split(/\s+/)
    .filter(Boolean);

  const group = groupOf(tags);
  const color = colorOf(tags);

  counts.set(category, counts.get(category) + 1);
  groupCounts.set(group, groupCounts.get(group) + 1);
  if (color) colorCounts.set(color, colorCounts.get(color) + 1);

  return {
    id,
    cat: category,
    group,
    color,
    main: primaryTag(tags),
    tags,
    thumb: `costume/thumbs/${id}.webp`,
    image: `costume/img/${id}.webp`,
  };
});

/* 源数据本身按分类排序，这里保持原顺序，只做完整性校验 */
const ids = new Set();
for (const item of costumes) {
  if (ids.has(item.id)) throw new Error(`duplicate id ${item.id}`);
  ids.add(item.id);
}

const out = {
  schema: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'COSTUME-DB-01 by giaaibusi',
  imageSize: '1366 × 2048',
  totals: {
    costumes: costumes.length,
    categories: CATEGORIES.length,
  },
  categories: CATEGORIES.map((item) => ({
    key: item.key,
    names: item.names,
    count: counts.get(item.key),
  })),
  groups: [
    ...GROUPS.map((group) => ({ key: group.key, names: group.names, count: groupCounts.get(group.key) })),
    { key: 'other', names: { zh: '其他', en: 'Other', ja: 'その他' }, count: groupCounts.get('other') },
  ].filter((group) => group.count > 0),
  colors: COLOR_TAGS
    .map((tag) => ({ key: tag, count: colorCounts.get(tag) }))
    .filter((color) => color.count > 0),
  costumes,
};

writeFileSync(resolve(ROOT, 'data/costumes.json'), `${JSON.stringify(out)}\n`);

console.log(
  `[costumes] ${costumes.length} items · ${out.categories.length} categories · ` +
  `${out.groups.length} groups · ${out.colors.length} colors → data/costumes.json`
);

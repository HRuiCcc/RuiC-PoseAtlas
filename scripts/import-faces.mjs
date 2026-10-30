#!/usr/bin/env node
/**
 * Build data/faces.json from the AI portrait gallery dataset.
 *
 * Source: https://ai-portrait-gallery.pages.dev/data/images.js (CC0 1.0).
 * The generated file keeps both a local path (portrait/…) and the original
 * absolute URL, so the page works offline and falls back to the source when
 * the local copies are not deployed.
 *
 * Usage: node scripts/import-faces.mjs [--source URL]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = 'https://ai-portrait-gallery.pages.dev/data/images.js';
const ORIGIN = 'https://ai-portrait-gallery.pages.dev/';

const sourceArg = process.argv.indexOf('--source');
const sourceUrl = sourceArg > -1 ? process.argv[sourceArg + 1] : DEFAULT_SOURCE;

const SECTIONS = [
  {
    key: 'face',
    source: 'face',
    names: { zh: '脸部', en: 'Face', ja: 'フェイス' },
    note: {
      zh: '正面朝向、纯背景的脸部参考，适合固定角色脸。',
      en: 'Front-facing faces on a plain background, made for keeping a character face consistent.',
      ja: '正面向き・無地背景の顔リファレンス。顔を揃えたいときに。',
    },
  },
  {
    key: 'styling',
    source: 'styling',
    names: { zh: '造型', en: 'Styling', ja: 'スタイリング' },
    note: {
      zh: '带服装、发型质感与整体氛围的参考，朝向不一。',
      en: 'Outfit, hair texture and overall mood references, in a mix of orientations.',
      ja: '服装・髪の質感・雰囲気までわかる参考画像。向きはさまざまです。',
    },
  },
];

const HAIRS = [
  { key: 'short', source: 'ショート', names: { zh: '短发', en: 'Short', ja: 'ショート' } },
  { key: 'medium', source: 'ミディアム', names: { zh: '中发', en: 'Medium', ja: 'ミディアム' } },
  { key: 'semilong', source: 'セミロング', names: { zh: '中长发', en: 'Semi-long', ja: 'セミロング' } },
  { key: 'long', source: 'ロング', names: { zh: '长发', en: 'Long', ja: 'ロング' } },
];

const sectionBySource = new Map(SECTIONS.map((section) => [section.source, section]));
const hairBySource = new Map(HAIRS.map((hair) => [hair.source, hair]));

function parseDataset(text) {
  const match = text.match(/window\.GALLERY_IMAGES\s*=\s*(\[[\s\S]*?\])\s*;?\s*$/);
  if (!match) throw new Error('GALLERY_IMAGES array not found in source');
  return JSON.parse(match[1]);
}

async function loadSource() {
  if (/^https?:/.test(sourceUrl)) {
    const response = await fetch(sourceUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${sourceUrl}`);
    return parseDataset(await response.text());
  }
  return parseDataset(await readFile(sourceUrl, 'utf8'));
}

function normalise(raw) {
  const rows = raw.map((item, index) => {
    const section = sectionBySource.get(item.section) ?? SECTIONS[0];
    const hair = hairBySource.get(item.hair);
    if (!hair) throw new Error(`Unknown hair category "${item.hair}" on ${item.id}`);
    const thumbRemote = new URL(item.thumb, ORIGIN).href;
    const fullRemote = new URL(item.full, ORIGIN).href;
    const file = path.basename(item.full);

    return {
      index,
      id: item.id,
      sec: section.key,
      hair: hair.key,
      style: item.style || '',
      w: item.w,
      h: item.h,
      thumb_w: item.thumb_w,
      thumb_h: item.thumb_h,
      bytes: item.bytes,
      thumb: `portrait/thumbs/${item.id}.webp`,
      full: `portrait/img/${file}`,
      thumb_remote: thumbRemote,
      full_remote: fullRemote,
    };
  });

  const sectionOrder = new Map(SECTIONS.map((section, index) => [section.key, index]));
  rows.sort((a, b) => (sectionOrder.get(a.sec) - sectionOrder.get(b.sec)) || (a.index - b.index));

  return rows.map(({ index, ...row }) => row);
}

const raw = await loadSource();
const images = normalise(raw);

const sectionCounts = new Map(SECTIONS.map((section) => [section.key, 0]));
const hairCounts = new Map(HAIRS.map((hair) => [hair.key, 0]));
for (const item of images) {
  sectionCounts.set(item.sec, sectionCounts.get(item.sec) + 1);
  hairCounts.set(item.hair, hairCounts.get(item.hair) + 1);
}

const data = {
  schema: 1,
  source: {
    name: 'AIモデル顔データベース',
    name_en: 'AI Model Face Database',
    url: 'https://ai-portrait-gallery.pages.dev/',
    author: 'あぎ',
    author_url: 'https://x.com/agi_aibusi',
    license: 'CC0 1.0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    note: 'Image files are served by the original site; this project does not redistribute them.',
  },
  totals: {
    images: images.length,
    sections: SECTIONS.length,
    hairs: HAIRS.length,
    face: sectionCounts.get('face'),
    styling: sectionCounts.get('styling'),
  },
  sections: SECTIONS.map((section) => ({
    key: section.key,
    names: section.names,
    note: section.note,
    count: sectionCounts.get(section.key),
  })),
  hairs: HAIRS.map((hair) => ({
    key: hair.key,
    names: hair.names,
    count: hairCounts.get(hair.key),
  })),
  images,
};

await mkdir(path.join(root, 'data'), { recursive: true });
const target = path.join(root, 'data/faces.json');
await writeFile(target, `${JSON.stringify(data)}\n`);

console.log(
  `Wrote ${path.relative(root, target)} · ${data.totals.images} images · ` +
  `face ${data.totals.face} · styling ${data.totals.styling} · ` +
  `${data.totals.hairs} hair categories`
);

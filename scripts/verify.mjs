#!/usr/bin/env node
/**
 * Offline integrity check for RuiC-PoseAtlas.
 * Validates data, translations, image files/dimensions and page wiring.
 */
import { readFile, readdir, stat, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warn = [];
const fail = (message) => errors.push(message);

const read = (rel) => readFile(path.join(root, rel));
const exists = async (rel) => {
  try { await stat(path.join(root, rel)); return true; } catch { return false; }
};

const data = JSON.parse(await read('data/poses.json'));
const { UI, LANGS } = await import(pathToFileURL(path.join(root, 'assets/js/i18n.js')).href);
const enNames = JSON.parse(await read('scripts/en-pose-names.json'));
const html = await readFile(path.join(root, 'index.html'), 'utf8');

/* Data shape -------------------------------------------------------------- */
if (data.schema !== 3) fail(`Unexpected schema: ${data.schema}`);
if (data.totals.poses !== 288) fail(`Expected 288 poses, got ${data.totals.poses}`);
if (data.totals.images !== 1439) fail(`Expected 1439 images, got ${data.totals.images}`);
if (data.poses.length !== data.totals.poses) fail('poses.length does not match totals');
if (data.series.length !== 4) fail(`Expected 4 series, got ${data.series.length}`);
if (data.angles.length !== 5) fail(`Expected 5 angles, got ${data.angles.length}`);
if (data.categories.length !== 26) fail(`Expected 26 categories, got ${data.categories.length}`);

const ids = new Set();
const seriesKeys = new Set(data.series.map((series) => series.key));
const categoryKeys = new Set(data.categories.map((category) => category.key));
const angleKeys = new Set(data.angles.map((angle) => angle.key));
let images = 0;
const referenced = new Set();

for (const pose of data.poses) {
  if (ids.has(pose.id)) fail(`Duplicate pose id: ${pose.id}`);
  ids.add(pose.id);
  if (!/^[a-z0-9_]+$/i.test(pose.id)) fail(`Unexpected pose id: ${pose.id}`);
  if (!seriesKeys.has(pose.series)) fail(`${pose.id}: unknown series ${pose.series}`);
  if (!categoryKeys.has(pose.category)) fail(`${pose.id}: unknown category ${pose.category}`);
  for (const lang of LANGS) {
    if (!pose.names?.[lang]?.trim()) fail(`${pose.id}: missing ${lang} name`);
  }
  if (!Number.isInteger(pose.variants?.length) || pose.variants.length < 4) {
    fail(`${pose.id}: expected at least 4 angle variants`);
  }
  const seenAngles = new Set();
  for (const variant of pose.variants) {
    if (seenAngles.has(variant.angle)) fail(`${pose.id}: duplicate angle ${variant.angle}`);
    seenAngles.add(variant.angle);
    if (!angleKeys.has(variant.angle)) fail(`${pose.id}: unknown angle ${variant.angle}`);
    for (const key of ['thumb', 'full']) {
      const rel = variant[key];
      const expectedPrefix = key === 'thumb' ? 'thumbs/' : 'img/';
      if (!rel.startsWith(expectedPrefix)) fail(`${pose.id}: ${key} outside ${expectedPrefix}`);
      if (referenced.has(rel)) fail(`Duplicate image reference: ${rel}`);
      referenced.add(rel);
    }
    images += 1;
  }
}
if (images !== data.totals.images) fail(`Variant count ${images} != totals.images`);
if (images !== 1439) fail(`Expected 1439 variants, got ${images}`);

if (Object.keys(enNames).length !== 288) fail('English name table should have 288 entries');
for (const id of ids) if (!(id in enNames)) fail(`Missing English entry: ${id}`);

for (const category of data.categories) {
  for (const lang of LANGS) if (!category.names?.[lang]?.trim()) fail(`Category ${category.key} missing ${lang}`);
  if (!data.poses.some((pose) => pose.category === category.key)) warn.push(`Unused category: ${category.key}`);
}
for (const series of data.series) {
  for (const lang of LANGS) {
    if (!series.names?.[lang]?.trim()) fail(`Series ${series.key} missing ${lang} name`);
    if (!series.short?.[lang]?.trim()) fail(`Series ${series.key} missing ${lang} short name`);
  }
  const cats = data.categoriesBySeries[series.key] ?? [];
  for (const cat of cats) if (!categoryKeys.has(cat)) fail(`${series.key}: unknown category ${cat}`);
  if (!cats.length) fail(`${series.key}: no categories`);
}
for (const angle of data.angles) {
  for (const lang of LANGS) if (!angle.names?.[lang]?.trim()) fail(`Angle ${angle.key} missing ${lang}`);
}

/* Translations ------------------------------------------------------------ */
const baseKeys = Object.keys(UI.zh).sort();
for (const lang of LANGS) {
  const keys = Object.keys(UI[lang] ?? {}).sort();
  if (keys.length !== baseKeys.length) fail(`UI.${lang} has ${keys.length} keys, zh has ${baseKeys.length}`);
  for (const key of baseKeys) {
    if (!(key in UI[lang])) fail(`UI.${lang} missing key: ${key}`);
    const zhValue = UI.zh[key];
    const value = UI[lang][key];
    if (Array.isArray(zhValue) !== Array.isArray(value)) fail(`UI.${lang}.${key} type mismatch`);
    if (Array.isArray(zhValue) && value.length !== zhValue.length) {
      fail(`UI.${lang}.${key} list length mismatch`);
    }
  }
}

const i18nPattern = /data-i18n(?:-html|-list|-placeholder|-aria|-alt)?="([^"]+)"/g;
for (const match of html.matchAll(i18nPattern)) {
  const key = match[1];
  if (!(key in UI.zh)) fail(`index.html references missing i18n key: ${key}`);
}

/* Images ------------------------------------------------------------------ */
const thumbFiles = (await readdir(path.join(root, 'thumbs'))).filter((file) => file.endsWith('.jpg'));
const imageFiles = (await readdir(path.join(root, 'img'))).filter((file) => file.endsWith('.png'));
if (thumbFiles.length !== 1439) fail(`thumbs/: expected 1439 files, got ${thumbFiles.length}`);
if (imageFiles.length !== 1439) fail(`img/: expected 1439 files, got ${imageFiles.length}`);

const pngSize = async (rel) => {
  const handle = await open(path.join(root, rel), 'r');
  const buffer = Buffer.alloc(24);
  await handle.read(buffer, 0, 24, 0);
  await handle.close();
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const jpegSize = (buffer) => {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd8) { offset += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
};

for (let i = 0; i < data.poses.length; i += 1) {
  const pose = data.poses[i];
  for (const variant of pose.variants) {
    const fullStat = await stat(path.join(root, variant.full));
    if (fullStat.size < 1024) fail(`${variant.full}: file too small`);
    const dimensions = await pngSize(variant.full);
    if (!dimensions || dimensions.width !== 900 || dimensions.height !== 1200) {
      fail(`${variant.full}: expected 900x1200 PNG, got ${JSON.stringify(dimensions)}`);
    }
    const thumbBuffer = await readFile(path.join(root, variant.thumb));
    if (thumbBuffer.subarray(0, 2).toString('hex') !== 'ffd8') fail(`${variant.thumb}: not a JPEG`);
    const thumbDims = jpegSize(thumbBuffer);
    if (!thumbDims || thumbDims.width !== 300 || thumbDims.height !== 400) {
      fail(`${variant.thumb}: expected 300x400 JPEG, got ${JSON.stringify(thumbDims)}`);
    }
    if (i > 3) break; // dimensions are consistent across the mirrored set; sample per pose
  }
}

/* Repo & page wiring ------------------------------------------------------ */
for (const file of ['index.html', 'assets/css/app.css', 'assets/js/app.js', 'assets/js/i18n.js',
  'data/poses.json', 'og-cover.jpg', 'assets/favicon.svg', '_headers', 'robots.txt',
  'LICENSE', 'README.md']) {
  if (!(await exists(file))) fail(`Missing file: ${file}`);
}
for (const preview of ['docs/preview-gallery.jpg', 'docs/preview-modal.jpg', 'docs/preview-mobile.jpg']) {
  if (!(await exists(preview))) warn.push(`Preview not generated yet: ${preview}`);
}
if (/support-qr|class="support"/.test(html)) fail('Payment QR/support section must not appear in the site UI');
if (html.includes('creditLead')) fail('Removed hero credit card still referenced in HTML');

if (!html.includes('data-lang="zh"') || !html.includes('data-lang="en"') || !html.includes('data-lang="ja"')) {
  fail('Language switch is incomplete');
}

/* Report ------------------------------------------------------------------ */
if (warn.length) {
  console.log('Warnings:');
  for (const message of warn) console.log('  -', message);
}
if (errors.length) {
  console.error(`\nFAILED with ${errors.length} error(s):`);
  for (const message of errors.slice(0, 40)) console.error('  -', message);
  if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
  process.exit(1);
}
console.log(
  `OK · ${data.totals.poses} poses · ${data.totals.images} images · ` +
  `${data.categories.length} categories · ${LANGS.length} languages · ` +
  `${thumbFiles.length} thumbs + ${imageFiles.length} originals verified`
);

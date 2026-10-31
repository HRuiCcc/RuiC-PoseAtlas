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
/* 部分克隆（git sparse-checkout 只取代码）里没有 img/ 与 thumbs/，
   设 SKIP_POSE_IMAGES=1 可跳过姿态图的文件与尺寸检查。 */
const skipPoseImages = process.env.SKIP_POSE_IMAGES === '1';

const listDir = async (rel, ext) => {
  try {
    return (await readdir(path.join(root, rel))).filter((file) => file.endsWith(ext));
  } catch {
    warn.push(`Missing folder: ${rel}`);
    return [];
  }
};

const thumbFiles = await listDir('thumbs', '.jpg');
const imageFiles = await listDir('img', '.png');
if (!skipPoseImages && thumbFiles.length !== 1439) fail(`thumbs/: expected 1439 files, got ${thumbFiles.length}`);
if (!skipPoseImages && imageFiles.length !== 1439) fail(`img/: expected 1439 files, got ${imageFiles.length}`);

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

for (let i = 0; !skipPoseImages && i < data.poses.length; i += 1) {
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
for (const file of ['index.html', 'costume.html', 'face.html', 'assets/css/app.css', 'assets/css/costume.css',
  'assets/css/collection.css', 'assets/css/face.css', 'assets/js/app.js', 'assets/js/costume.js',
  'assets/js/face.js', 'assets/js/i18n.js', 'assets/js/costume-i18n.js', 'assets/js/face-i18n.js',
  'assets/js/costume-tags.js', 'data/poses.json', 'data/costumes.json', 'data/faces.json',
  'og-cover.jpg', 'assets/favicon.svg', '_headers', 'robots.txt',
  'LICENSE', 'README.md']) {
  if (!(await exists(file))) fail(`Missing file: ${file}`);
}
for (const preview of ['docs/preview-gallery.jpg', 'docs/preview-modal.jpg', 'docs/preview-mobile.jpg',
  'docs/preview-costume-gallery.jpg', 'docs/preview-costume-modal.jpg', 'docs/preview-costume-mobile.jpg',
  'docs/preview-face-gallery.jpg', 'docs/preview-face-modal.jpg', 'docs/preview-face-mobile.jpg']) {
  if (!(await exists(preview))) warn.push(`Preview not generated yet: ${preview}`);
}

/* Costume atlas ----------------------------------------------------------- */
const costumes = JSON.parse(await read('data/costumes.json'));
const costumeUI = (await import(pathToFileURL(path.join(root, 'assets/js/costume-i18n.js')).href)).UI;
const tags = await import(pathToFileURL(path.join(root, 'assets/js/costume-tags.js')).href);
const costumeHtml = await readFile(path.join(root, 'costume.html'), 'utf8');

if (costumes.schema !== 1) fail(`Unexpected costume schema: ${costumes.schema}`);
if (costumes.totals.costumes !== 1407) fail(`Expected 1407 costumes, got ${costumes.totals.costumes}`);
if (costumes.costumes.length !== costumes.totals.costumes) fail('costume list length != totals');
if (costumes.categories.length !== 8) fail(`Expected 8 costume categories, got ${costumes.categories.length}`);

const costumeIds = new Set();
const costumeCats = new Set(costumes.categories.map((category) => category.key));
const costumeGroups = new Set(costumes.groups.map((group) => group.key));
const costumeColors = new Set(costumes.colors.map((color) => color.key));
const categoryTally = new Map();

for (const item of costumes.costumes) {
  if (costumeIds.has(item.id)) fail(`Duplicate costume id: ${item.id}`);
  costumeIds.add(item.id);
  if (!/^[A-Z]{3}-\d{4}$/.test(item.id)) fail(`Unexpected costume id format: ${item.id}`);
  if (!costumeCats.has(item.cat)) fail(`${item.id}: unknown category ${item.cat}`);
  if (!costumeGroups.has(item.group)) fail(`${item.id}: unknown group ${item.group}`);
  if (item.color && !costumeColors.has(item.color)) fail(`${item.id}: unknown colour ${item.color}`);
  if (!item.tags.length) fail(`${item.id}: no tags`);
  for (const tag of item.tags) if (!(tag in tags.TAG_NAMES)) fail(`${item.id}: untranslated tag "${tag}"`);
  if (!item.tags.includes(item.main)) fail(`${item.id}: main tag not in tag list`);
  for (const [key, prefix] of [['thumb', 'costume/thumbs/'], ['image', 'costume/img/']]) {
    if (!item[key].startsWith(prefix)) fail(`${item.id}: ${key} outside ${prefix}`);
    if (!(await exists(item[key]))) fail(`${item.id}: missing file ${item[key]}`);
  }
  categoryTally.set(item.cat, (categoryTally.get(item.cat) ?? 0) + 1);
}

for (const category of costumes.categories) {
  for (const lang of LANGS) if (!category.names?.[lang]?.trim()) fail(`Costume category ${category.key} missing ${lang}`);
  if (category.count !== categoryTally.get(category.key)) {
    fail(`Costume category ${category.key}: count ${category.count} != ${categoryTally.get(category.key)}`);
  }
}
for (const group of costumes.groups) {
  for (const lang of LANGS) if (!group.names?.[lang]?.trim()) fail(`Costume group ${group.key} missing ${lang}`);
}
for (const [tag, names] of Object.entries(tags.TAG_NAMES)) {
  for (const lang of LANGS) if (!names[lang]?.trim()) fail(`Tag ${tag} missing ${lang} label`);
}

const costumeBaseKeys = Object.keys(costumeUI.zh).sort();
for (const lang of LANGS) {
  const keys = Object.keys(costumeUI[lang] ?? {}).sort();
  if (keys.length !== costumeBaseKeys.length) {
    fail(`costume UI.${lang} has ${keys.length} keys, zh has ${costumeBaseKeys.length}`);
  }
  for (const key of costumeBaseKeys) {
    if (!(key in costumeUI[lang])) fail(`costume UI.${lang} missing key: ${key}`);
    const zhValue = costumeUI.zh[key];
    const value = costumeUI[lang][key];
    if (Array.isArray(zhValue) !== Array.isArray(value)) fail(`costume UI.${lang}.${key} type mismatch`);
    if (Array.isArray(zhValue) && value.length !== zhValue.length) {
      fail(`costume UI.${lang}.${key} list length mismatch`);
    }
  }
}

for (const match of costumeHtml.matchAll(i18nPattern)) {
  const key = match[1];
  if (!(key in costumeUI.zh)) fail(`costume.html references missing i18n key: ${key}`);
}

const costumeThumbs = (await readdir(path.join(root, 'costume/thumbs'))).filter((f) => f.endsWith('.webp'));
const costumeImages = (await readdir(path.join(root, 'costume/img'))).filter((f) => f.endsWith('.webp'));
if (costumeThumbs.length !== 1407) fail(`costume/thumbs: expected 1407 files, got ${costumeThumbs.length}`);
if (costumeImages.length !== 1407) fail(`costume/img: expected 1407 files, got ${costumeImages.length}`);

const webpSize = async (rel) => {
  const buffer = Buffer.alloc(32);
  const handle = await open(path.join(root, rel), 'r');
  await handle.read(buffer, 0, 32, 0);
  await handle.close();
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return { format: chunk };
};

/* 原作绝大多数是 1366×2048，另有 33 张作者重出过的小一号版本（1254–1360 宽）。
   统一按 2:3 竖版校验，不锁死像素。 */
for (let i = 0; i < costumes.costumes.length; i += 1) {
  const item = costumes.costumes[i];
  const full = await webpSize(item.image);
  const ratio = full ? full.width / full.height : 0;
  if (!full || ratio < 0.64 || ratio > 0.69 || full.height < 1500) {
    fail(`${item.image}: expected a 2:3 portrait WEBP, got ${JSON.stringify(full)}`);
  }
}

for (let i = 0; i < costumes.costumes.length; i += 60) {
  const item = costumes.costumes[i];
  const thumb = await webpSize(item.thumb);
  if (!thumb || thumb.width !== 360 || thumb.height !== 540) {
    fail(`${item.thumb}: expected 360x540 WEBP, got ${JSON.stringify(thumb)}`);
  }
}

if (/support-qr|class="support"/.test(html)) fail('Payment QR/support section must not appear in the site UI');
if (html.includes('creditLead')) fail('Removed hero credit card still referenced in HTML');

if (!html.includes('data-lang="zh"') || !html.includes('data-lang="en"') || !html.includes('data-lang="ja"')) {
  fail('Language switch is incomplete');
}

/* Portrait atlas ---------------------------------------------------------- */
const faces = JSON.parse(await read('data/faces.json'));
const faceUI = (await import(pathToFileURL(path.join(root, 'assets/js/face-i18n.js')).href)).UI;
const faceHtml = await readFile(path.join(root, 'face.html'), 'utf8');

if (faces.schema !== 1) fail(`Unexpected portrait schema: ${faces.schema}`);
if (faces.totals.images !== 1499) fail(`Expected 1499 portraits, got ${faces.totals.images}`);
if (faces.totals.face !== 893) fail(`Expected 893 face images, got ${faces.totals.face}`);
if (faces.totals.styling !== 606) fail(`Expected 606 styling images, got ${faces.totals.styling}`);
if (faces.images.length !== faces.totals.images) fail('portrait list length != totals');
if (faces.sections.length !== 2) fail(`Expected 2 portrait sections, got ${faces.sections.length}`);
if (faces.hairs.length !== 4) fail(`Expected 4 hairstyles, got ${faces.hairs.length}`);

const portraitIds = new Set();
const portraitSections = new Set(faces.sections.map((section) => section.key));
const portraitHairs = new Set(faces.hairs.map((hair) => hair.key));
const portraitSectionTally = new Map();
const portraitHairTally = new Map();

for (const item of faces.images) {
  if (portraitIds.has(item.id)) fail(`Duplicate portrait id: ${item.id}`);
  portraitIds.add(item.id);
  if (!/^[a-z0-9]+$/i.test(item.id)) fail(`Unexpected portrait id: ${item.id}`);
  if (!portraitSections.has(item.sec)) fail(`${item.id}: unknown section ${item.sec}`);
  if (!portraitHairs.has(item.hair)) fail(`${item.id}: unknown hairstyle ${item.hair}`);
  if (typeof item.style !== 'string') fail(`${item.id}: style must be a string`);
  if (!Number.isInteger(item.w) || !Number.isInteger(item.h) || item.w < 1 || item.h < 1) {
    fail(`${item.id}: invalid dimensions ${item.w}x${item.h}`);
  }
  if (item.thumb !== `portrait/thumbs/${item.id}.webp`) fail(`${item.id}: unexpected thumb path ${item.thumb}`);
  if (item.full !== `portrait/img/${item.id}.png`) fail(`${item.id}: unexpected full path ${item.full}`);
  if (item.thumb_remote !== `https://ai-portrait-gallery.pages.dev/img/thumb/${item.id}.webp`) {
    fail(`${item.id}: unexpected remote thumb ${item.thumb_remote}`);
  }
  if (item.full_remote !== `https://ai-portrait-gallery.pages.dev/img/full/${item.id}.png`) {
    fail(`${item.id}: unexpected remote full ${item.full_remote}`);
  }
  if (!Number.isInteger(item.thumb_w) || !Number.isInteger(item.thumb_h)) {
    fail(`${item.id}: invalid thumbnail dimensions`);
  }
  if (!Number.isInteger(item.bytes) || item.bytes < 1024) fail(`${item.id}: invalid byte size`);

  portraitSectionTally.set(item.sec, (portraitSectionTally.get(item.sec) ?? 0) + 1);
  portraitHairTally.set(item.hair, (portraitHairTally.get(item.hair) ?? 0) + 1);
}

for (const section of faces.sections) {
  for (const lang of LANGS) if (!section.names?.[lang]?.trim()) fail(`Portrait section ${section.key} missing ${lang}`);
  for (const lang of LANGS) if (!section.note?.[lang]?.trim()) fail(`Portrait section ${section.key} missing ${lang} note`);
  if (section.count !== portraitSectionTally.get(section.key)) {
    fail(`Portrait section ${section.key}: count ${section.count} != ${portraitSectionTally.get(section.key)}`);
  }
}
for (const hair of faces.hairs) {
  for (const lang of LANGS) if (!hair.names?.[lang]?.trim()) fail(`Portrait hairstyle ${hair.key} missing ${lang}`);
  if (hair.count !== portraitHairTally.get(hair.key)) {
    fail(`Portrait hairstyle ${hair.key}: count ${hair.count} != ${portraitHairTally.get(hair.key)}`);
  }
}
if (!faces.source?.url?.startsWith('https://ai-portrait-gallery.pages.dev/')) {
  fail('Portrait source URL is missing or unexpected');
}

const faceBaseKeys = Object.keys(faceUI.zh).sort();
for (const lang of LANGS) {
  const keys = Object.keys(faceUI[lang] ?? {}).sort();
  if (keys.length !== faceBaseKeys.length) {
    fail(`face UI.${lang} has ${keys.length} keys, zh has ${faceBaseKeys.length}`);
  }
  for (const key of faceBaseKeys) {
    if (!(key in faceUI[lang])) fail(`face UI.${lang} missing key: ${key}`);
    const zhValue = faceUI.zh[key];
    const value = faceUI[lang][key];
    if (Array.isArray(zhValue) !== Array.isArray(value)) fail(`face UI.${lang}.${key} type mismatch`);
    if (Array.isArray(zhValue) && value.length !== zhValue.length) {
      fail(`face UI.${lang}.${key} list length mismatch`);
    }
  }
}

for (const match of faceHtml.matchAll(i18nPattern)) {
  const key = match[1];
  if (!(key in faceUI.zh)) fail(`face.html references missing i18n key: ${key}`);
}

/* portrait/thumbs ships with the repo; portrait/img is a local-only download
   (≈4.5 GB, gitignored). When the full folder is present, check counts and
   sample dimensions; when absent, the site falls back to the original URL. */
const listOptional = async (rel, ext) => {
  try {
    return (await readdir(path.join(root, rel))).filter((file) => file.endsWith(ext));
  } catch {
    return [];
  }
};

const portraitThumbs = await listOptional('portrait/thumbs', '.webp');
const portraitImages = await listOptional('portrait/img', '.png');
if (portraitThumbs.length !== 1499) {
  fail(`portrait/thumbs: expected 1499 files, got ${portraitThumbs.length}`);
}
if (portraitImages.length && portraitImages.length !== 1499) {
  fail(`portrait/img: expected 1499 files, got ${portraitImages.length}`);
}

for (let i = 0; i < faces.images.length; i += 75) {
  const item = faces.images[i];
  const thumb = await webpSize(item.thumb);
  if (!thumb || thumb.width !== item.thumb_w || thumb.height !== item.thumb_h) {
    fail(`${item.thumb}: expected ${item.thumb_w}x${item.thumb_h} WEBP, got ${JSON.stringify(thumb)}`);
  }
  if (portraitImages.length) {
    const full = await pngSize(item.full);
    if (!full || full.width !== item.w || full.height !== item.h) {
      fail(`${item.full}: expected ${item.w}x${item.h} PNG, got ${JSON.stringify(full)}`);
    }
  }
}
if (!portraitImages.length) {
  warn.push('portrait/img/ originals not downloaded; run `npm run fetch-faces` for offline full-size copies');
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
  `${costumes.totals.costumes} outfits · ${costumes.categories.length} costume categories · ` +
  `${faces.totals.images} portraits (${faces.totals.face} face + ${faces.totals.styling} styling) · ` +
  `${thumbFiles.length} thumbs + ${imageFiles.length} originals · ` +
  `${costumeThumbs.length} + ${costumeImages.length} costume images · ` +
  `${portraitThumbs.length} + ${portraitImages.length} local portrait images verified`
);

#!/usr/bin/env node
/**
 * Downloads every image referenced by data/poses.json into img/ and thumbs/.
 * Used to restore assets in a fresh clone, and safe to run repeatedly:
 * existing valid files are skipped, failed files are retried.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(root, 'data/poses.json'), 'utf8'));

const files = [...new Set(
  data.poses.flatMap((pose) => pose.variants.flatMap((variant) => [variant.thumb, variant.full]))
)].sort();

const expected = data.totals.images * 2;
if (files.length !== expected) {
  throw new Error(`Expected ${expected} image paths, found ${files.length}`);
}

const BASES = [
  'https://raw.githubusercontent.com/HRuiCcc/RuiC-PoseAtlas/main/',
  'https://cdn.jsdelivr.net/gh/HRuiCcc/RuiC-PoseAtlas@main/',
];
const CONCURRENCY = 24;
const ATTEMPTS = 6;
const UA = 'RuiC-PoseAtlas image fetcher (+https://github.com/HRuiCcc/RuiC-PoseAtlas)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function signatureValid(rel, buffer) {
  if (buffer.length < 1024) return false;
  if (rel.endsWith('.png')) {
    return buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  }
  return buffer.subarray(0, 2).toString('hex') === 'ffd8';
}

async function alreadyValid(rel) {
  try {
    const info = await stat(path.join(root, rel));
    if (info.size < 1024) return false;
    const buffer = await readFile(path.join(root, rel));
    return signatureValid(rel, buffer);
  } catch {
    return false;
  }
}

async function download(rel, attempt) {
  const base = BASES[attempt % BASES.length];
  const response = await fetch(base + rel, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!signatureValid(rel, buffer)) throw new Error('invalid image signature');

  const dest = path.join(root, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part-${process.pid}-${Math.random().toString(36).slice(2)}`;
  await writeFile(tmp, buffer);
  const { rename } = await import('node:fs/promises');
  await rename(tmp, dest);
}

let cursor = 0;
let done = 0;
let downloaded = 0;
const failures = [];

async function worker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= files.length) return;

    const rel = files[index];
    if (await alreadyValid(rel)) {
      done += 1;
      continue;
    }

    let ok = false;
    let lastError = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      try {
        await download(rel, attempt);
        ok = true;
        downloaded += 1;
        break;
      } catch (error) {
        lastError = error;
        await sleep(800 * (attempt + 1));
      }
    }

    done += 1;
    if (!ok) failures.push(`${rel}: ${lastError?.message ?? 'unknown error'}`);
    if (done % 100 === 0 || done === files.length) {
      console.log(`[mirror] ${done}/${files.length} processed · ${downloaded} downloaded · ${failures.length} failed`);
    }
  }
}

console.log(`[mirror] ${files.length} image paths (${data.totals.images} originals + ${data.totals.images} thumbs)`);
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

if (failures.length) {
  console.error(`[mirror] ${failures.length} file(s) failed:`);
  for (const failure of failures.slice(0, 30)) console.error('  -', failure);
  process.exit(1);
}
console.log(`[mirror] complete · ${downloaded} downloaded · ${files.length - downloaded} already present`);

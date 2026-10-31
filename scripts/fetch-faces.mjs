#!/usr/bin/env node
/**
 * Download every portrait image (thumbs + full-size PNGs) into portrait/.
 *
 * Reads data/faces.json, downloads from the original gallery origin, skips
 * files that are already complete, retries transient failures and reports
 * progress. The downloaded folder is intentionally not committed: the public
 * site loads the original files directly, while this local copy makes the
 * gallery work offline.
 *
 * Usage:
 *   node scripts/fetch-faces.mjs            # everything missing
 *   node scripts/fetch-faces.mjs --force    # re-download everything
 *   node scripts/fetch-faces.mjs --thumbs   # thumbnails only
 */
import { readFile, mkdir, stat, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONCURRENCY = 6;
const RETRIES = 4;

const force = process.argv.includes('--force');
const thumbsOnly = process.argv.includes('--thumbs');

const data = JSON.parse(await readFile(path.join(root, 'data/faces.json'), 'utf8'));

await mkdir(path.join(root, 'portrait/thumbs'), { recursive: true });
await mkdir(path.join(root, 'portrait/img'), { recursive: true });

const jobs = [];
for (const item of data.images) {
  jobs.push({ item, kind: 'thumb', rel: item.thumb, url: item.thumb_remote, minBytes: 1024 });
  if (!thumbsOnly) jobs.push({ item, kind: 'full', rel: item.full, url: item.full_remote, minBytes: item.bytes });
}

async function isComplete(job) {
  if (force) return false;
  try {
    const info = await stat(path.join(root, job.rel));
    if (!info.isFile()) return false;
    if (job.kind === 'full') return info.size === job.minBytes;
    return info.size >= job.minBytes;
  } catch {
    return false;
  }
}

async function download(job) {
  if (await isComplete(job)) return 'skip';

  const target = path.join(root, job.rel);
  const temp = `${target}.part`;
  let lastError;

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(job.url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < job.minBytes) {
        throw new Error(`truncated: ${buffer.length} < ${job.minBytes}`);
      }
      await writeFile(temp, buffer);
      await rename(temp, target);
      return 'done';
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  throw new Error(`${job.url}: ${lastError?.message ?? 'unknown error'}`);
}

let next = 0;
let done = 0;
let skipped = 0;
const failures = [];
const total = jobs.length;
const started = Date.now();

async function worker() {
  while (next < jobs.length) {
    const job = jobs[next];
    next += 1;
    try {
      const result = await download(job);
      if (result === 'done') done += 1;
      else skipped += 1;
    } catch (error) {
      failures.push(error.message);
    }
    const finished = done + skipped + failures.length;
    if (finished % 50 === 0 || finished === total) {
      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(`[${finished}/${total}] downloaded ${done} · existing ${skipped} · failed ${failures.length} · ${seconds}s`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

if (failures.length) {
  console.error(`\n${failures.length} download(s) failed:`);
  for (const message of failures.slice(0, 20)) console.error('  -', message);
  if (failures.length > 20) console.error(`  ... and ${failures.length - 20} more`);
  process.exit(1);
}

console.log(`\nPortrait images ready · ${data.totals.images} images · downloaded ${done}, reused ${skipped}`);

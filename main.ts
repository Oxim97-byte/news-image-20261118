// news-image-20261118 — entry runner (Node 22, standard library only).
//
// The entry is the newspaper image sitting next to this file: one page of
// "WORLD NEWS" for Wednesday, 18 November 2026, built from an AI-drawn
// night globe over Asia-Pacific plus typeset headlines. This script does
// three things, in order:
//
//   1. Check the image is really a PNG or JPEG, at most 1 MiB, and at most
//      1024 x 1024 pixels (the competition's image gate).
//   2. Copy it byte for byte to $MAKEFUN_OUTPUT_DIR/entry.png
//      (default /output), creating the directory if needed.
//   3. Read the copy back and confirm every byte matches, so a truncated
//      or half-written file can never pass silently.
//
// No network, no dependencies, no image decoding beyond reading the
// width/height out of the file header.
//
// Run it locally with:
//   MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Competition limits for the image.
const MAX_SIZE_BYTES = 1_048_576; // 1 MiB
const MAX_SIDE_PX = 1024;

// Abort with a message the runner can show the entrant.
function reject(reason: string): never {
  throw new Error(`news-image-20261118 entry rejected: ${reason}`);
}

// Pull (width, height) out of a JPEG or PNG header without decoding pixels.
// JPEG: scan markers until a Start Of Frame segment carries the size.
// PNG: width and height sit at fixed offsets inside the IHDR chunk.
function imageSize(buf: Buffer): [number, number] {
  const isJpeg = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
  if (isJpeg) {
    let pos = 2;
    while (pos + 9 < buf.length) {
      if (buf[pos] !== 0xff) reject('JPEG is malformed: expected a marker byte');
      const marker = buf[pos + 1];
      if (marker === 0xd9) break; // end of image reached, no frame seen
      const segLen = buf.readUInt16BE(pos + 2);
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return [buf.readUInt16BE(pos + 7), buf.readUInt16BE(pos + 5)];
      }
      pos += 2 + segLen;
    }
    reject('JPEG has no Start Of Frame segment, so its size is unknown');
  }

  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const looksPng = buf.length >= 24 && pngSig.every((b, i) => buf[i] === b);
  const ihdr = buf.length >= 24 &&
    buf[12] === 0x49 && buf[13] === 0x48 && buf[14] === 0x44 && buf[15] === 0x52;
  if (looksPng && ihdr) {
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  }

  reject('entry.png is neither a JPEG nor a PNG file');
}

// --- Gate 1: load and validate ----------------------------------------
const entryUrl = new URL('./entry.png', import.meta.url);
let image: Buffer;
try {
  image = readFileSync(entryUrl);
} catch {
  reject('entry.png is missing next to main.ts — nothing to validate or copy');
}

if (image.length > MAX_SIZE_BYTES) {
  reject(`entry.png is ${image.length} bytes, above the ${MAX_SIZE_BYTES} byte limit`);
}
const [w, h] = imageSize(image);
if (w > MAX_SIDE_PX || h > MAX_SIDE_PX) {
  reject(`entry.png is ${w}x${h}px, above the ${MAX_SIDE_PX}x${MAX_SIDE_PX}px limit`);
}

// --- Gate 2: copy byte for byte ---------------------------------------
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, 'entry.png');
writeFileSync(outputPath, image);

// --- Gate 3: verify the copy ------------------------------------------
const copied = readFileSync(outputPath);
if (!copied.equals(image)) {
  reject(`output file ${outputPath} does not match entry.png byte for byte`);
}

console.log(`wrote ${outputPath} (${w}x${h}px, ${image.length} bytes)`);

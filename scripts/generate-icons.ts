/**
 * Rasterizes the BookNexa icon (blue→purple tile + white mark) into the PNGs
 * Next.js / storefronts need. Re-run whenever the mark changes:
 *
 *   npx tsx scripts/generate-icons.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const OUT_DIR = path.join(process.cwd(), "public");

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="bnxTile" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2563EB"/>
      <stop offset="1" stop-color="#7C3AED"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" fill="url(#bnxTile)"/>
  <path d="M32 6 C33 11.5 35 13.5 40 14.5 C35 15.5 33 17.5 32 23 C31 17.5 29 15.5 24 14.5 C29 13.5 31 11.5 32 6 Z" fill="#FFFFFF" opacity="0.95"/>
  <path d="M30 25 C25 21 18 20 12 22 C10 30 10 38 13 44 C19 41 25 42 30 46 Z" fill="#FFFFFF" opacity="0.95"/>
  <path d="M34 25 C39 21 46 20 52 22 C54 30 54 38 51 44 C45 41 39 42 34 46 Z" fill="#FFFFFF" opacity="0.8"/>
  <path d="M32 23 L36 31 L32 45 L28 31 Z" fill="#0B1E3B"/>
  <circle cx="32" cy="30" r="2" fill="#FFFFFF"/>
</svg>`;

const TARGETS: Array<[file: string, size: number]> = [
  ["apple-icon.png", 180],
  ["icon-512.png", 512],
  ["product-150x150.png", 150],
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    for (const [file, size] of TARGETS) {
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
      const svg = TILE_SVG.replace('width="64" height="64"', `width="${size}" height="${size}"`);
      await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`, {
        waitUntil: "load",
      });
      const buf = await page.screenshot({ type: "png" });
      fs.writeFileSync(path.join(OUT_DIR, file), buf);
      console.log(`wrote public/${file} (${size}x${size})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

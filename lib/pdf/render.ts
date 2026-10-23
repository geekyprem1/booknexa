/**
 * Puppeteer PDF renderer.
 *
 * Renders an HTML string to a print-ready PDF at an exact physical page size.
 * We drive the page size from CSS `@page` (preferCSSPageSize) and disable
 * Puppeteer margins so the output matches the KDP spec to the inch.
 *
 * A single browser instance is reused across renders (cheap browser pool) so
 * this is safe to call repeatedly from a script or, later, a background task.
 */

import puppeteer, { type Browser, type Page } from "puppeteer";

let browserPromise: Promise<Browser> | null = null;

const LOCAL_RENDER_PROTOCOLS = new Set(["about:", "blob:", "data:", "file:"]);

/**
 * The only external origins a render may reach. Cover typography is built on web
 * fonts (Montserrat, Cinzel, Luckiest Guy, …) because the production container has
 * no system fonts to fall back to — blocking these silently collapses every genre
 * to one generic sans. Nothing else is reachable, so an injected URL still cannot
 * be used to probe the network.
 */
const FONT_CDN_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

export interface PageSecurityOptions {
  /** Allow the Google Fonts CDN (needed by the Cover Studio templates only). */
  allowFontCdn?: boolean;
}

async function securePage(page: Page, opts: PageSecurityOptions = {}): Promise<void> {
  await page.setJavaScriptEnabled(false);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    let allowed = false;
    try {
      const url = new URL(request.url());
      allowed =
        LOCAL_RENDER_PROTOCOLS.has(url.protocol) ||
        (opts.allowFontCdn === true &&
          url.protocol === "https:" &&
          FONT_CDN_HOSTS.has(url.hostname));
    } catch {
      // Malformed and scheme-less requests are not needed for self-contained renders.
    }
    void (allowed ? request.continue() : request.abort("blockedbyclient"));
  });
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    // PUPPETEER_EXECUTABLE_PATH lets the deploy env (Coolify/Docker) point at a
    // system Chromium so we don't ship the 300MB bundled browser inside the image.
    // Unset locally → puppeteer uses its own bundled Chromium as before.
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

export interface RenderOptions {
  widthIn: number;
  heightIn: number;
}

/**
 * Render a flowing, multi-page document whose page size + margins come entirely
 * from CSS `@page`. Use for reports (vs. renderPdf which pins one fixed page size).
 */
export async function renderPdfFromCss(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await securePage(page);
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}

export interface PngOptions {
  widthIn: number;
  heightIn: number;
  /** Render resolution for the preview image. Default 150 DPI. */
  dpi?: number;
  /** Allow the Google Fonts CDN — required for the Cover Studio's genre typography. */
  allowFontCdn?: boolean;
  /** Output format. Default PNG; JPEG is what KDP accepts for Kindle eBook covers. */
  type?: "png" | "jpeg";
  /** JPEG quality 0–100 (ignored for PNG). Default 92. */
  quality?: number;
}

const CSS_PX_PER_IN = 96;

/**
 * Render a single-page HTML document to a PNG at a physical size — used for
 * preview screenshots. The page is sized in CSS inches; deviceScaleFactor
 * upscales to the requested DPI.
 */
export async function renderPng(
  html: string,
  opts: PngOptions
): Promise<Uint8Array> {
  const dpi = opts.dpi ?? 150;
  const width = Math.round(opts.widthIn * CSS_PX_PER_IN);
  const height = Math.round(opts.heightIn * CSS_PX_PER_IN);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await securePage(page, { allowFontCdn: opts.allowFontCdn === true });
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: dpi / CSS_PX_PER_IN,
    });
    await page.setContent(html, { waitUntil: "load" });
    try {
      await page.evaluate(
        () => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))])
      );
    } catch {
      /* font readiness is best-effort; proceed with whatever is loaded */
    }
    const clip = { x: 0, y: 0, width, height };
    if (opts.type === "jpeg") {
      return await page.screenshot({ type: "jpeg", quality: opts.quality ?? 92, clip });
    }
    return await page.screenshot({ type: "png", clip });
  } finally {
    await page.close();
  }
}

/**
 * Render HTML to a PDF buffer at the given physical size.
 * Fonts are embedded by Chromium automatically.
 */
export async function renderPdf(
  html: string,
  opts: RenderOptions
): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await securePage(page);
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      width: `${opts.widthIn}in`,
      height: `${opts.heightIn}in`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return pdf;
  } finally {
    await page.close();
  }
}

/**
 * Screenshot selected pages of a multi-page interior document. The pages
 * (`section.page`) stack vertically on screen, each exactly one page tall, so
 * page i sits at y = i × pageHeight. The document loads once for all pages.
 */
export async function renderPagePngs(
  html: string,
  opts: PngOptions,
  pageIndexes: number[]
): Promise<Uint8Array[]> {
  const dpi = opts.dpi ?? 100;
  const width = Math.round(opts.widthIn * CSS_PX_PER_IN);
  const height = opts.heightIn * CSS_PX_PER_IN;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await securePage(page);
    await page.setViewport({ width, height: Math.round(height), deviceScaleFactor: dpi / CSS_PX_PER_IN });
    await page.setContent(html, { waitUntil: "load" });
    const out: Uint8Array[] = [];
    for (const i of pageIndexes) {
      out.push(
        await page.screenshot({
          type: "png",
          clip: { x: 0, y: i * height, width, height: Math.round(height) },
          captureBeyondViewport: true,
        })
      );
    }
    return out;
  } finally {
    await page.close();
  }
}

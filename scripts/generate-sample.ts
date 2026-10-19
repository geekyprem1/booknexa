/**
 * PDF Engine Gate — generate sample PDFs.
 *
 * Produces a KDP-compliant 6x9 interior PDF and a matching wraparound cover PDF
 * in /output. Upload both to Amazon KDP and confirm they pass the previewer.
 *
 *   npm run gate:generate
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildGateSample, computeInterior, computeCover, closeBrowser } from "../lib/pdf";

const TRIM = "6x9" as const;
const PAGE_COUNT = 100; // >=79 so the spine carries text; exercises the gutter table
const PAPER = "white" as const;

async function main() {
  const outDir = path.resolve(process.cwd(), "output");
  await mkdir(outDir, { recursive: true });

  const interiorSpec = computeInterior({ trim: TRIM, pageCount: PAGE_COUNT });
  const coverSpec = computeCover({ trim: TRIM, pageCount: PAGE_COUNT, paper: PAPER });

  console.log("── PDF Engine Gate ─────────────────────────────");
  console.log(`Trim ${TRIM} · ${PAGE_COUNT} pages · ${PAPER} paper`);
  console.log(
    `Interior page: ${interiorSpec.pageWidthIn}in x ${interiorSpec.pageHeightIn}in ` +
      `(gutter ${interiorSpec.marginInsideIn}in, outside ${interiorSpec.marginOutsideIn}in)`
  );
  console.log(
    `Cover: ${coverSpec.fullWidthIn.toFixed(3)}in x ${coverSpec.fullHeightIn.toFixed(3)}in ` +
      `(spine ${coverSpec.spineWidthIn.toFixed(3)}in, spine text: ${coverSpec.allowsSpineText})`
  );
  console.log("Rendering…");

  const { interior, cover } = await buildGateSample({
    trim: TRIM,
    pageCount: PAGE_COUNT,
    paper: PAPER,
    meta: {
      title: "The Compliance Test",
      subtitle: "A 6x9 KDP Gate Sample",
      author: "BookNexa",
      backText:
        "This sample exists to validate the KDP PDF engine. If Amazon's previewer accepts both this cover and its interior with no errors, the PDF Engine Gate has passed and generator development can begin.",
    },
  });

  const interiorPath = path.join(outDir, `interior-${TRIM}.pdf`);
  const coverPath = path.join(outDir, `cover-${TRIM}.pdf`);
  await writeFile(interiorPath, interior.pdf);
  await writeFile(coverPath, cover.pdf);

  console.log("\n✓ Wrote:");
  console.log(`  ${interiorPath}`);
  console.log(`  ${coverPath}`);
  console.log("\nNext: run `npm run gate:verify`, then upload both to KDP.");

  await closeBrowser();
}

main().catch((err) => {
  console.error("Gate generation failed:", err);
  process.exitCode = 1;
});

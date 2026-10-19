/**
 * Cover V2 end-to-end smoke test against the live providers
 * (Replicate for images, OpenRouter for the spelling check).
 *
 *   npm run smoke:cover-v2
 *   npm run smoke:cover-v2 -- --genre kids --title "Sleepy Little Fox"
 *   npm run smoke:cover-v2 -- --set            # generate the full concept set
 *
 * Runs the real pipeline including the repair loop and the hybrid fallback, then
 * reports every attempt so you can see how often the model spells correctly.
 *
 * Writes to output/cover-v2-smoke/. Nothing touches the database or object storage.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { generateConceptSet, generateOneConcept, type GeneratedConcept } from "../lib/cover-v2/generate";
import { coverV2ModelSummary, coverV2Unavailable } from "../lib/cover-v2/config";
import { CoverV2SafetyError } from "../lib/cover-v2/errors";
import { COVER_GENRES, type CoverGenre } from "../lib/cover/types";
import { closeBrowser } from "../lib/pdf";

const OUT = "output/cover-v2-smoke";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function report(concept: GeneratedConcept, stem: string): Promise<void> {
  await writeFile(`${OUT}/${stem}.png`, concept.png);
  await writeFile(`${OUT}/${stem}.artwork.jpg`, concept.jpeg);
  await writeFile(`${OUT}/${stem}.prompt.txt`, concept.prompt);

  console.log(`  brief by     : ${concept.briefModel}`);
  console.log(`  image model  : ${concept.imageModel}`);
  console.log(`  generated at : ${concept.generatedPx.width}×${concept.generatedPx.height}`);
  console.log(`  delivered at : ${concept.finalPx.width}×${concept.finalPx.height} PNG (300 DPI)`);
  console.log(`  text source  : ${concept.textSource === "model" ? "image model" : "hybrid — type set by the stable engine"}`);
  console.log(`  attempts     : ${concept.attempts.length}`);
  for (const [i, a] of concept.attempts.entries()) {
    const mark = a.ok ? "✓" : "✗";
    console.log(`    ${i + 1}. ${mark} ${a.strategy}${a.ok ? "" : ` — ${a.reason}`}`);
    if (!a.ok && a.transcribed) {
      console.log(`         read: "${a.transcribed.replace(/\s+/g, " ").slice(0, 90)}"`);
    }
  }
  console.log(`  files        : ${OUT}/${stem}.png`);
}

async function main(): Promise<void> {
  const blocked = coverV2Unavailable();
  if (blocked) {
    console.error(blocked === "disabled" ? "✗ COVER_V2_ENABLED is 0" : "✗ REPLICATE_API_TOKEN is not set");
    process.exit(1);
  }

  const genreArg = arg("genre", "business") as CoverGenre;
  const genre = COVER_GENRES.includes(genreArg) ? genreArg : "business";
  const input = {
    title: arg("title", "Quiet Mornings")!,
    subtitle: arg("subtitle", "A Field Guide to Slow Days"),
    author: arg("author", "Prem Sharma"),
    genre,
    trim: arg("trim", "6x9")!,
  };
  const model = arg("model");
  const models = coverV2ModelSummary();
  // --hybrid skips the model's own typography and goes straight to wordless artwork
  // plus our engine's type, which is how the fallback path gets exercised on demand.
  const maxAttempts = process.argv.includes("--hybrid") ? 0 : undefined;

  console.log("Cover V2 smoke test\n");
  console.log(`  title : ${input.title}`);
  console.log(`  genre : ${genre}`);
  console.log(`  model : ${model ?? models.model}`);
  console.log(`  verify: ${models.verifyModel}`);
  if (maxAttempts === 0) console.log("  mode  : hybrid only (wordless art + stable typography)");
  console.log("");

  await mkdir(OUT, { recursive: true });
  const started = Date.now();

  try {
    if (process.argv.includes("--set")) {
      const set = await generateConceptSet(input, {
        model,
        maxAttempts,
        onProgress: (step) => console.log(`  · ${step}…`),
      });
      console.log(`\n── ${set.length} concept(s) in ${((Date.now() - started) / 1000).toFixed(0)}s ──`);
      for (const [i, c] of set.entries()) {
        console.log(`\nConcept ${i + 1}`);
        await report(c, `${genre}-${i}`);
      }
    } else {
      const concept = await generateOneConcept(input, {
        model,
        maxAttempts,
        onProgress: (step) => console.log(`  · ${step}…`),
      });
      console.log(`\n── Result (${((Date.now() - started) / 1000).toFixed(0)}s) ──`);
      await report(concept, `${genre}-single`);
    }
  } catch (error) {
    if (error instanceof CoverV2SafetyError) {
      console.error("\n✗ Blocked by the content filter.");
      console.error("  This usually means the title closely echoes a well-known published work.");
      await closeBrowser();
      process.exit(1);
    }
    throw error;
  }

  await closeBrowser();
}

main().catch(async (e) => {
  await closeBrowser().catch(() => {});
  console.error("\nsmoke test failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

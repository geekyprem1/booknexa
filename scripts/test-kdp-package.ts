import assert from "node:assert/strict";
import JSZip from "jszip";
import { createBookNexaManifest, validateKdpManifest } from "../lib/kdp/package-manifest";

async function main(): Promise<void> {
  const printManifest = createBookNexaManifest({ bookType: "coloring", assetNames: ["interior.pdf", "cover.pdf"] });
  assert.equal(printManifest.format, "paperback");
  assert.equal(printManifest.assets.manuscript, "interior.pdf");
  assert.equal(printManifest.assets.cover, "cover.pdf");
  assert.equal(validateKdpManifest(printManifest).source.adapter, "booknexa-native");

  const ebookManifest = createBookNexaManifest({ bookType: "ebook", assetNames: ["manuscript.epub", "cover.jpg"] });
  assert.equal(ebookManifest.format, "ebook");
  assert.doesNotThrow(() => validateKdpManifest(ebookManifest));

  assert.throws(() => validateKdpManifest({ ...printManifest, assets: { ...printManifest.assets, cover: "../private.pdf" } }), /safe package-relative path/);
  assert.throws(() => validateKdpManifest({ ...printManifest, schemaVersion: 99 }), /schemaVersion/);
  assert.throws(() => createBookNexaManifest({ bookType: "ebook", assetNames: ["manuscript.epub"] }), /cover asset/);

  const fixture = new JSZip();
  fixture.file("metadata.json", JSON.stringify({ title: "Fixture", author: "Test Author", description: "Fixture description" }));
  fixture.file("interior.pdf", "%PDF-fixture");
  fixture.file("cover.pdf", "%PDF-cover-fixture");
  fixture.file("booknexa-kdp.json", JSON.stringify(printManifest));
  const bytes = await fixture.generateAsync({ type: "uint8array" });
  const reopened = await JSZip.loadAsync(bytes);
  const manifestFile = reopened.file("booknexa-kdp.json");
  assert.ok(manifestFile);
  const parsed = JSON.parse(await manifestFile.async("string"));
  assert.equal(validateKdpManifest(parsed).assets.manuscript, "interior.pdf");
  assert.ok(reopened.file("metadata.json"));
  console.log("KDP package contract checks passed (print, ebook, path rejection, and ZIP fixture)");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

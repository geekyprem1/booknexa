import type { KdpFormat } from "./types";

export type KdpPackageManifest = {
  schemaVersion: 1;
  format: KdpFormat;
  metadata: string;
  assets: { manuscript: string; cover: string };
  source: { adapter: string; version: string; license?: string; sourceUrl?: string };
  validation?: {
    status: "passed" | "warnings" | "not-run";
    validator?: string;
    validatedAt?: string;
    warnings?: string[];
  };
};

const SAFE_PACKAGE_PATH = /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))(?!.*(?:^|[\\/])\.(?:[\\/]|$)).+$/;

export function assertSafePackagePath(value: string, field: string): void {
  if (!value || value.length > 500 || !SAFE_PACKAGE_PATH.test(value)) {
    throw new Error(`${field} must be a safe package-relative path`);
  }
}

function findAsset(assets: readonly { name: string }[], expected: string[], role: string): string {
  const match = assets.find((asset) => expected.includes(asset.name.split(/[\\/]/).at(-1)?.toLowerCase() ?? ""));
  if (!match) throw new Error(`KDP package needs a ${role} asset (${expected.join(" or ")})`);
  assertSafePackagePath(match.name, `${role} asset path`);
  return match.name;
}

/** Creates the common package manifest for BookNexa's existing ZIP builder. */
export function createBookNexaManifest(opts: {
  bookType: string;
  assetNames: readonly string[];
  version?: string;
}): KdpPackageManifest {
  const ebook = opts.bookType === "ebook";
  const assets = opts.assetNames.map((name) => ({ name }));
  const manuscript = findAsset(
    assets,
    ebook ? ["manuscript.epub", "manuscript.docx", "content.epub"] : ["interior.pdf", "manuscript.pdf", "interior.docx"],
    "manuscript"
  );
  const cover = findAsset(
    assets,
    ebook ? ["cover.jpg", "cover.jpeg", "cover.tif", "cover.tiff"] : ["cover.pdf"],
    "cover"
  );
  return {
    schemaVersion: 1,
    format: ebook ? "ebook" : "paperback",
    metadata: "metadata.json",
    assets: { manuscript, cover },
    source: { adapter: "booknexa-native", version: opts.version ?? "0.1.0", license: "internal" },
  };
}

export function validateKdpManifest(value: unknown): KdpPackageManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("KDP manifest must be a JSON object");
  const manifest = value as Partial<KdpPackageManifest>;
  if (manifest.schemaVersion !== 1) throw new Error("KDP manifest schemaVersion must be 1");
  if (manifest.format !== "ebook" && manifest.format !== "paperback" && manifest.format !== "hardcover") {
    throw new Error("KDP manifest format must be ebook, paperback, or hardcover");
  }
  if (!manifest.source || typeof manifest.source.adapter !== "string" || !manifest.source.adapter.trim()
      || typeof manifest.source.version !== "string" || !manifest.source.version.trim()) {
    throw new Error("KDP manifest source must include adapter and version");
  }
  if (!manifest.assets || typeof manifest.assets.manuscript !== "string" || typeof manifest.assets.cover !== "string") {
    throw new Error("KDP manifest assets must include manuscript and cover paths");
  }
  if (typeof manifest.metadata !== "string") throw new Error("KDP manifest metadata path is required");
  assertSafePackagePath(manifest.metadata, "metadata path");
  assertSafePackagePath(manifest.assets.manuscript, "manuscript path");
  assertSafePackagePath(manifest.assets.cover, "cover path");
  return manifest as KdpPackageManifest;
}

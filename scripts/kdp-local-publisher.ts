#!/usr/bin/env node
/**
 * Local-only KDP package preflight and browser handoff.
 * This first milestone intentionally does not fill forms, upload files, or publish.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import JSZip from "jszip";
import puppeteer from "puppeteer";
import { ensureLocalKdpAccount, listLocalKdpAccounts } from "../lib/kdp/local-accounts";

type KdpFormat = "ebook" | "paperback" | "hardcover";
type PackageManifest = {
  schemaVersion: number;
  format?: KdpFormat;
  metadata?: string;
  assets?: { manuscript?: string; cover?: string };
};
type Metadata = Record<string, unknown> & {
  title?: string;
  author?: string;
  description?: string;
  keywords?: unknown;
  book_type?: string;
  format?: string;
  publication_format?: string;
};
type CliOptions = { packagePath?: string; format?: KdpFormat; checkOnly: boolean; openBrowser: boolean; account?: string; listAccounts: boolean };

const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;
const MAX_ENTRIES = 5_000;
const MAX_METADATA_BYTES = 1_000_000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;
const MANIFEST_NAME = "booknexa-kdp.json";
const METADATA_NAME = "metadata.json";

function usage(): string {
  return [
    "BookNexa local KDP package preflight (local browser handoff only)",
    "",
    "Usage:",
    "  npm run kdp:local -- --package <publish-package.zip> [--format ebook|paperback|hardcover] [--check]",
    "  npm run kdp:local -- --package <publish-package.zip> --open --account <label>",
    "  npm run kdp:local -- --list-accounts",
    "  npm run kdp:accounts -- add|list [label]",
    "",
    "Options:",
    "  --package <path>  BookNexa ZIP or another generator's compatible package ZIP",
    "  --format <format> KDP edition; can also be set in booknexa-kdp.json",
    "  --check           Validate and summarize only (default)",
    "  --open            Open the visible local browser at KDP after validation",
    "  --account <label> Select an isolated local Amazon account browser profile",
    "  --list-accounts   List labels of local profiles (never reads their cookies)",
    "  --help            Show this help",
    "",
    "This version never fills KDP forms, uploads files, or submits/publishes a book.",
  ].join("\n");
}

function parseArgs(args: string[]): CliOptions | null {
  let packagePath: string | undefined;
  let format: KdpFormat | undefined;
  let checkOnly = true;
  let openBrowser = false;
  let account: string | undefined;
  let listAccounts = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      return null;
    }
    if (arg === "--package") {
      packagePath = args[++i] ?? "";
      continue;
    }
    if (arg === "--format") {
      const value = args[++i];
      if (value !== "ebook" && value !== "paperback" && value !== "hardcover") {
        throw new Error("--format must be ebook, paperback, or hardcover");
      }
      format = value;
      continue;
    }
    if (arg === "--account") {
      account = args[++i]?.trim();
      if (!account) throw new Error("--account requires a local profile label");
      continue;
    }
    if (arg === "--list-accounts") {
      listAccounts = true;
      continue;
    }
    if (arg === "--check") {
      checkOnly = true;
      continue;
    }
    if (arg === "--open") {
      openBrowser = true;
      checkOnly = false;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (listAccounts) {
    if (packagePath || openBrowser || account) throw new Error("--list-accounts cannot be combined with package or browser options");
    return { checkOnly: true, openBrowser: false, listAccounts: true };
  }
  if (!packagePath) throw new Error("--package is required");
  if (openBrowser && !account) throw new Error("Choose a local profile with --account <label> before opening KDP");
  return { packagePath: path.resolve(packagePath), format, checkOnly, openBrowser, account, listAccounts: false };
}

function safeZipEntryName(name: string): boolean {
  const normalized = name.replaceAll("\\", "/");
  return !normalized.startsWith("/")
    && !/^[a-zA-Z]:/.test(normalized)
    && !normalized.split("/").some((part) => part === ".." || part === ".");
}

function normalizedFormat(value: unknown): KdpFormat | undefined {
  if (value === "ebook" || value === "paperback" || value === "hardcover") return value;
  return undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function basenameLower(name: string): string {
  return path.posix.basename(name.replaceAll("\\", "/")).toLowerCase();
}

function findByName(zip: JSZip, name: string | undefined): JSZip.JSZipObject | undefined {
  if (!name) return undefined;
  return zip.file(name) ?? Object.values(zip.files).find((entry) => !entry.dir && entry.name === name);
}

function pickAsset(zip: JSZip, explicit: string | undefined, names: string[]): JSZip.JSZipObject | undefined {
  if (explicit) return findByName(zip, explicit);
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  for (const candidate of names) {
    const match = files.find((entry) => basenameLower(entry.name) === candidate);
    if (match) return match;
  }
  return undefined;
}

function validExtension(file: JSZip.JSZipObject, allowed: string[]): boolean {
  return allowed.includes(path.posix.extname(file.name).toLowerCase());
}

async function readJson(zip: JSZip, entryName: string): Promise<Record<string, unknown>> {
  const entry = findByName(zip, entryName);
  if (!entry || entry.dir) throw new Error(`Package is missing ${entryName}`);
  const bytes = await entry.async("uint8array");
  if (bytes.byteLength > MAX_METADATA_BYTES) throw new Error(`${entryName} exceeds the 1 MB metadata limit`);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(`${entryName} is not valid JSON`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${entryName} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

async function inspectPackage(options: CliOptions): Promise<{
  format: KdpFormat;
  metadata: Metadata;
  manuscript: JSZip.JSZipObject;
  cover: JSZip.JSZipObject;
}> {
  const packagePath = options.packagePath!;
  const info = await stat(packagePath);
  if (!info.isFile()) throw new Error("--package must point to a ZIP file");
  if (info.size > MAX_ARCHIVE_BYTES) throw new Error("Package ZIP exceeds the 250 MB safety limit");

  const bytes = await readFileBounded(packagePath, info.size);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ENTRIES) throw new Error(`Package contains more than ${MAX_ENTRIES} entries`);
  let expandedBytes = 0;
  for (const entry of entries) {
    if (!safeZipEntryName(entry.name)) throw new Error(`Unsafe path in ZIP: ${entry.name}`);
    if (entry.dir) continue;
    const estimated = entry._data?.uncompressedSize ?? 0;
    expandedBytes += estimated;
    if (expandedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) throw new Error("Package expands beyond the 500 MB safety limit");
  }

  let manifest: PackageManifest | undefined;
  if (findByName(zip, MANIFEST_NAME)) {
    const parsed = await readJson(zip, MANIFEST_NAME);
    if (parsed.schemaVersion !== 1) throw new Error(`${MANIFEST_NAME} schemaVersion must be 1`);
    if (parsed.format && !normalizedFormat(parsed.format)) throw new Error(`${MANIFEST_NAME} has an unsupported format`);
    manifest = parsed as PackageManifest;
    for (const referenced of [manifest.metadata, manifest.assets?.manuscript, manifest.assets?.cover]) {
      if (referenced && !safeZipEntryName(referenced)) throw new Error(`Unsafe package manifest path: ${referenced}`);
    }
  }

  if (options.format && manifest?.format && options.format !== manifest.format) {
    throw new Error(`--format ${options.format} conflicts with manifest format ${manifest.format}`);
  }

  const metadataPath = manifest?.metadata ?? METADATA_NAME;
  const metadata = await readJson(zip, metadataPath) as Metadata;
  const metadataFormat = normalizedFormat(metadata.publication_format) ?? normalizedFormat(metadata.format);
  const format = options.format
    ?? normalizedFormat(manifest?.format)
    ?? metadataFormat
    ?? (metadata.book_type === "ebook" ? "ebook" : undefined);
  if (!format) throw new Error("Could not determine KDP edition. Pass --format or set format in booknexa-kdp.json");

  const assets = manifest?.assets ?? {};
  const manuscriptNames = format === "ebook"
    ? ["manuscript.epub", "manuscript.docx", "content.epub", "content.docx", "book.epub", "book.docx", "manuscript.kpf"]
    : ["interior.pdf", "manuscript.pdf", "interior.docx", "manuscript.docx", "content.pdf", "content.docx"];
  const coverNames = format === "ebook"
    ? ["cover.jpg", "cover.jpeg", "cover.tif", "cover.tiff", "cover.png", "ebook-cover.jpg"]
    : ["cover.pdf", "cover-wrap.pdf", "wrap.pdf", "cover.png", "cover.jpg", "cover.jpeg"];
  const manuscript = pickAsset(zip, assets.manuscript, manuscriptNames);
  const cover = pickAsset(zip, assets.cover, coverNames);
  if (!manuscript || manuscript.dir) throw new Error(`Package needs a manuscript asset for ${format}`);
  if (!cover || cover.dir) throw new Error(`Package needs a cover asset for ${format}`);

  const manuscriptTypes: Record<KdpFormat, string[]> = {
    ebook: [".epub", ".docx", ".kpf"],
    paperback: [".pdf", ".docx"],
    hardcover: [".pdf", ".docx"],
  };
  const coverTypes: Record<KdpFormat, string[]> = {
    ebook: [".jpg", ".jpeg", ".tif", ".tiff", ".png"],
    paperback: [".pdf"],
    hardcover: [".pdf"],
  };
  if (!validExtension(manuscript, manuscriptTypes[format])) throw new Error(`${format} manuscript must use: ${manuscriptTypes[format].join(", ")}`);
  if (!validExtension(cover, coverTypes[format])) throw new Error(`${format} cover must use: ${coverTypes[format].join(", ")}`);
  if (!text(metadata.title) || !text(metadata.author) || !text(metadata.description)) {
    throw new Error(`${metadataPath} must include non-empty title, author, and description`);
  }
  return { format, metadata, manuscript, cover };
}

async function readFileBounded(filePath: string, expectedSize: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of createReadStream(filePath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_ARCHIVE_BYTES || total > expectedSize) throw new Error("Package ZIP changed or exceeds the size limit while reading");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

function printSummary(result: Awaited<ReturnType<typeof inspectPackage>>, packagePath: string): void {
  const keywords = Array.isArray(result.metadata.keywords) ? result.metadata.keywords.length : 0;
  console.log("\nPackage preflight passed");
  console.log(`  Package:    ${packagePath}`);
  console.log(`  Edition:    ${result.format}`);
  console.log(`  Title:      ${text(result.metadata.title)}`);
  console.log(`  Author:     ${text(result.metadata.author)}`);
  console.log(`  Manuscript: ${result.manuscript.name}`);
  console.log(`  Cover:      ${result.cover.name}`);
  console.log(`  Keywords:   ${keywords}`);
  console.log("\nNo files were extracted or uploaded.");
}

async function openKdp(accountLabel: string): Promise<void> {
  const account = await ensureLocalKdpAccount(accountLabel);
  console.log(`\nOpening KDP using local profile: ${account.label}`);
  console.log(`Browser profile and session data stay on this device: ${account.profileDir}`);
  console.log("Sign in yourself if needed. This milestone does not read page contents, fill forms, upload, or publish.");

  const browser = await puppeteer.launch({ headless: false, userDataDir: account.profileDir, defaultViewport: null });
  try {
    const page = await browser.newPage();
    await page.goto("https://kdp.amazon.com/bookshelf", { waitUntil: "domcontentloaded" });
    const terminal = createInterface({ input: stdin, output: stdout });
    await terminal.question("When you're done reviewing KDP, press Enter here to close the browser. ");
    terminal.close();
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) return;
  if (options.listAccounts) {
    const accounts = await listLocalKdpAccounts();
    if (!accounts.length) console.log("No local account profiles. Add one with: npm run kdp:accounts -- add 'US imprint'");
    else for (const account of accounts) console.log(`${account.label}\t${account.id}\t${account.profileDir}`);
    return;
  }
  const result = await inspectPackage(options);
  printSummary(result, options.packagePath!);
  if (options.openBrowser) await openKdp(options.account!);
  else if (options.checkOnly) console.log("\nCheck only: no browser was opened.");
}

main().catch((error: unknown) => {
  console.error(`\nKDP local tool stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

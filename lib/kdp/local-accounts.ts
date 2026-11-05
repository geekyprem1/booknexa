import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type LocalKdpAccount = {
  id: string;
  label: string;
  createdAt: string;
  profileDir: string;
};

type AccountRecord = { schemaVersion: 1; id: string; label: string; createdAt: string };

const ROOT = path.join(homedir(), ".booknexa-kdp-publisher");
const ACCOUNTS_DIR = path.join(ROOT, "accounts");

function accountId(label: string): string {
  return createHash("sha256").update(label.trim().toLocaleLowerCase("en-US")).digest("hex").slice(0, 24);
}

function validateLabel(label: string): string {
  const normalized = label.trim();
  if (!normalized || normalized.length > 80 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("Account label must be 1–80 printable characters");
  }
  return normalized;
}

function accountDir(id: string): string {
  return path.join(ACCOUNTS_DIR, id);
}

function profileDir(id: string): string {
  return path.join(accountDir(id), "chrome-profile");
}

async function readRecord(dir: string): Promise<AccountRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path.join(dir, "account.json"), "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Partial<AccountRecord>;
    if (record.schemaVersion !== 1 || typeof record.id !== "string" || typeof record.label !== "string" || typeof record.createdAt !== "string") return null;
    return record as AccountRecord;
  } catch {
    return null;
  }
}

/** Create a dedicated, local-only Chromium profile for this human-readable account label. */
export async function ensureLocalKdpAccount(rawLabel: string): Promise<LocalKdpAccount> {
  const label = validateLabel(rawLabel);
  const id = accountId(label);
  const dir = accountDir(id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const recordPath = path.join(dir, "account.json");
  let record = await readRecord(dir);
  if (record && record.label.toLocaleLowerCase("en-US") !== label.toLocaleLowerCase("en-US")) {
    throw new Error("Account identifier collision; choose a different label");
  }
  if (!record) {
    record = { schemaVersion: 1, id, label, createdAt: new Date().toISOString() };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
      const existing = await readRecord(dir);
      if (!existing || existing.label.toLocaleLowerCase("en-US") !== label.toLocaleLowerCase("en-US")) throw new Error("Could not safely initialize local account profile");
      record = existing;
    });
  }
  const browserProfile = profileDir(id);
  await mkdir(browserProfile, { recursive: true, mode: 0o700 });
  return { id, label: record.label, createdAt: record.createdAt, profileDir: browserProfile };
}

/** List local account labels only; never inspect Chromium cookies or session data. */
export async function listLocalKdpAccounts(): Promise<LocalKdpAccount[]> {
  let entries;
  try {
    entries = await readdir(ACCOUNTS_DIR, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const accounts: LocalKdpAccount[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-f0-9]{24}$/.test(entry.name)) continue;
    const dir = accountDir(entry.name);
    const record = await readRecord(dir);
    if (!record || record.id !== entry.name) continue;
    accounts.push({ id: record.id, label: record.label, createdAt: record.createdAt, profileDir: profileDir(record.id) });
  }
  return accounts.sort((a, b) => a.label.localeCompare(b.label));
}

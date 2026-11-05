#!/usr/bin/env node
import { ensureLocalKdpAccount, listLocalKdpAccounts } from "../lib/kdp/local-accounts";

function usage(): void {
  console.log([
    "BookNexa local KDP account profiles (credentials stay in local Chromium profiles)",
    "",
    "Usage:",
    "  npm run kdp:accounts -- add <label>",
    "  npm run kdp:accounts -- list",
    "",
    "Each label gets an isolated browser profile. This tool does not store Amazon passwords or sync sessions to BookNexa.",
  ].join("\n"));
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--help" || command === "-h" || !command) {
    usage();
    return;
  }
  if (command === "add") {
    const label = args.join(" ").trim();
    if (!label) throw new Error("Provide a label, for example: npm run kdp:accounts -- add 'US imprint'");
    const account = await ensureLocalKdpAccount(label);
    console.log(`Local KDP profile ready: ${account.label}`);
    console.log(`Profile directory: ${account.profileDir}`);
    console.log("Sign in to Amazon only in the visible browser opened by the publisher. This label is local and is not an Amazon account credential.");
    return;
  }
  if (command === "list") {
    const accounts = await listLocalKdpAccounts();
    if (!accounts.length) {
      console.log("No local KDP profiles yet. Add one with: npm run kdp:accounts -- add 'US imprint'");
      return;
    }
    for (const account of accounts) console.log(`${account.label}\t${account.id}\t${account.profileDir}`);
    return;
  }
  usage();
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  console.error(`KDP account profiles: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

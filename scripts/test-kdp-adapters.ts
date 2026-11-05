import assert from "node:assert/strict";
import { GENERATOR_ADAPTERS, getGeneratorAdapter, listAdaptersForFormat } from "../lib/kdp/adapters";

assert.ok(getGeneratorAdapter("booknexa-native"), "native adapter must be registered");
assert.equal(getGeneratorAdapter("not-registered"), undefined);
assert.ok(listAdaptersForFormat("ebook").some((adapter) => adapter.id === "kindlepub"));
assert.ok(listAdaptersForFormat("paperback").some((adapter) => adapter.id === "kdp-toolkit"));
assert.ok(GENERATOR_ADAPTERS.every((adapter) => adapter.id && adapter.name && adapter.notes && adapter.formats.length > 0));
assert.ok(GENERATOR_ADAPTERS.filter((adapter) => adapter.id !== "booknexa-native").every((adapter) => adapter.status !== "native"), "external repos are not enabled before audit");
console.log(`Adapter registry checks passed (${GENERATOR_ADAPTERS.length} entries)`);

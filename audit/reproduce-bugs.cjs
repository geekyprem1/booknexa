// Offline audit reproductions. Executes repository source with controlled DB/API doubles.
// No credentials, live accounts, external requests, or paid generations are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const evidence = [];
const quietConsole = { log() {}, error() {}, warn() {} };

function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: file,
  });
  vm.runInNewContext(outputText, {
    module, exports: module.exports, console: quietConsole, process: { env: {} },
    Buffer, Date, Promise, Uint8Array, URL, Response, AggregateError,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('.') || name.startsWith('@/')) throw new Error(`Missing mock: ${name} in ${file}`);
      return require(name);
    },
    ...globals,
  }, { filename: file });
  return module.exports;
}

class Query {
  constructor(table, execute) { this.table = table; this.execute = execute; this.op = 'select'; this.filters = {}; }
  select(fields, options) { this.fields = fields; this.options = options; return this; }
  eq(field, value) { this.filters[field] = value; return this; }
  in() { return this; }
  gte() { return this; }
  order() { return this; }
  range() { return this; }
  limit() { return this; }
  insert(payload) { this.op = 'insert'; this.payload = payload; return this; }
  update(payload) { this.op = 'update'; this.payload = payload; return this; }
  upsert(payload) { this.op = 'upsert'; this.payload = payload; return this; }
  delete() { this.op = 'delete'; return this; }
  single() { return Promise.resolve().then(() => this.execute(this)); }
  maybeSingle() { return this.single(); }
  then(resolve, reject) { return this.single().then(resolve, reject); }
}
const ok = (data = null) => ({ data, error: null });
function client(execute, rpc) { return { from: (table) => new Query(table, execute), rpc }; }
const plans = load('lib/billing/plans.ts');
const offers = load('lib/offers.ts');
const errors = load('lib/supabase/errors.ts');
const adminMock = (c) => ({ getSupabaseAdminClient: () => c });
function subscription(c) {
  return load('lib/billing/subscription.ts', { '../supabase/admin': adminMock(c), './plans': plans });
}
function userModule(c, sub, credits, audit = async () => {}) {
  return load('lib/admin/users.ts', {
    '../supabase/admin': adminMock(c), '../supabase/errors': errors,
    '../billing/subscription': sub, '../billing/credits': credits,
    '../offers': offers, './audit': { logAdminAction: audit },
  });
}
async function check(id, title, fn) {
  const detail = await fn();
  evidence.push({ id, title, detail });
  console.log(`${id}: REPRODUCED - ${title}\n  ${detail}`);
}

async function main() {
  await check('B01', 'Paid cover entitlements cannot open the unified studio', async () => {
    for (const key of ['creator-suite', 'agency', 'reseller', 'unlimited:downsell']) {
      const offer = offers.grantableByKey(key);
      assert.equal(plans.canUseFeature('starter', 'cover', offer.entitlements), true);
      assert.equal(plans.canUseFeature('starter', 'cover_v2', offer.entitlements), false);
    }
    let destination;
    load('app/dashboard/cover/page.tsx', { 'next/navigation': { redirect: (p) => { destination = p; } } }).default();
    assert.equal(destination, '/dashboard/cover-v2');
    return 'Four offers grant cover=true, but the only studio redirects to a feature they cannot access.';
  });

  await check('B02', 'Unlimited failure refund adds credits without a debit', async () => {
    let balance = 100; const calls = [];
    const c = client(() => ok(), async (name, args) => {
      calls.push(name);
      if (name === 'add_credits') balance += args.p_delta;
      return ok(balance);
    });
    const credits = load('lib/billing/credits.ts', {
      '../supabase/admin': adminMock(c), './subscription': { getOrCreateSubscription: async () => ({ credits_remaining: balance, entitlements: { unlimited: true } }) },
      './plans': plans,
    });
    await credits.reserve('user', 4, 'cover_v2');
    await credits.refund('user', 4);
    assert.equal(balance, 104); assert.deepEqual(calls, ['add_credits']);
    return 'Balance 100 -> 104 after reserve(4), failure, refund(4); spend_credits was never called.';
  });

  await check('B03', 'Plan changes overwrite concurrent credit spending', async () => {
    const row = { id: 'sub', user_id: 'user', plan_name: 'Free Trial', credits_remaining: 100, provider: 'none' };
    const c = client((q) => {
      if (q.table === 'subscriptions' && q.op === 'select') return ok({ ...row });
      if (q.table === 'subscriptions' && q.op === 'update') {
        row.credits_remaining -= 10; // Another transaction spends after the snapshot was read.
        Object.assign(row, q.payload); return ok({ ...row });
      }
      return ok();
    });
    await subscription(c).changePlan('user', 'starter');
    assert.equal(row.credits_remaining, 220);
    return '100 - 10 concurrent spend + 120 plan credits should be 210; stored balance is 220.';
  });

  await check('B04', 'Concurrent offer grants lose an entitlement', async () => {
    const row = { entitlements: {}, credits_remaining: 100 };
    const c = client((q) => {
      if (q.op === 'select') return ok(structuredClone(row));
      Object.assign(row, q.payload); return ok();
    });
    const sub = subscription(c);
    await Promise.all([
      sub.applyOfferMeta('user', { entitlements: offers.grantableByKey('dfy').entitlements }),
      sub.applyOfferMeta('user', { entitlements: offers.grantableByKey('creator-suite').entitlements }),
    ]);
    assert.equal(row.entitlements.cover, true); assert.equal(row.entitlements.dfy_assets, undefined);
    return `Two successful concurrent grants leave only ${JSON.stringify(row.entitlements)}.`;
  });

  await check('B05', 'Offer delivery can fail after features have already unlocked', async () => {
    let unlocked = false; let audited = false;
    const users = userModule({}, { applyOfferMeta: async () => { unlocked = true; } }, {
      grant: async () => { throw new Error('credit RPC unavailable'); },
    }, async () => { audited = true; });
    await assert.rejects(users.adminGrantOffer({ userId: 'admin' }, 'user', 'unlimited'));
    assert.equal(unlocked, true); assert.equal(audited, false);
    return 'Credit RPC fails after unlimited access is committed; request fails and no grant_offer history is written.';
  });

  await check('B06', 'Factory and Autopilot paths bypass generation caps', async () => {
    let queries = 0;
    const c = client(() => { queries++; return { count: 1000, data: null, error: null }; });
    const caps = load('lib/billing/caps.ts', { '../supabase/admin': adminMock(c) });
    await caps.assertWithinCaps('user', 'factory');
    await caps.assertWithinCaps('user', 'autopilot');
    assert.equal(queries, 0);
    await assert.rejects(caps.assertWithinCaps('user', 'coloring'));
    return 'At a simulated 1,000 completed generations, coloring is blocked but factory/autopilot perform zero cap checks.';
  });

  await check('B07', 'Autopilot ignores loss of the job attempt and keeps generating', async () => {
    const angles = [1, 2, 3].map((i) => ({ title: `Book ${i}`, angle: `Topic ${i}`, status: 'pending' }));
    let bookNumber = 0; let charged = 0; let lostSignals = 0;
    const c = client((q) => {
      if (q.table === 'autopilot_runs' && q.op === 'select') return ok({ angles: structuredClone(angles) });
      if (q.table === 'books' && q.op === 'insert') return ok({ id: `book-${++bookNumber}` });
      if (q.table === 'ebook_chapters') return ok(q.payload.map((_, i) => ({ id: `chapter-${i}` })));
      if (q.table === 'book_metadata') return ok({ book_id: 'book' });
      if (q.table === 'books') return ok({ id: `book-${bookNumber}` });
      return ok();
    });
    const ebook = load('lib/books/ebook-pipeline.ts', {
      '../supabase/admin': adminMock(c), '../supabase/errors': errors,
      '../storage': { putBytes: async () => {}, bookObjectKey: () => 'cover' },
      '../generators/ebook': { buildEbook: async () => ({ title: 'Title', chapters: [{ idx: 1 }], coverBytes: new Uint8Array(), keywords: [] }) },
      '../publishing/profile': { profileAuthor: () => 'Author', loadPublishingProfile: async () => ({}) },
      '../pdf/kdp-specs': { TRIM_SIZES: { '6x9': {} } },
    });
    const pipeline = load('lib/books/autopilot-pipeline.ts', {
      '../supabase/admin': adminMock(c), './ebook-pipeline': ebook,
      '../billing': { reserve: async (_u, cost) => { charged += cost; }, refund: async (_u, cost) => { charged -= cost; }, recordUsage: async () => {}, InsufficientCreditsError: class extends Error {} },
    });
    const result = await pipeline.runAutopilotBooks('user', { runId: 'run', costPerBook: 10 }, async () => {
      lostSignals++; throw new Error('Job attempt no longer owns the lease');
    });
    assert.equal(result.doneCount, 3); assert.equal(charged, 30); assert.ok(lostSignals > 0);
    return `Despite ${lostSignals} lost-attempt errors, all 3 books complete and consume 30 credits.`;
  });

  await check('B08', 'Unset Cover V2 concept count returns one instead of the declared default two', async () => {
    const config = load('lib/cover-v2/config.ts', { '../ai/models': { isAiConfigured: () => false } });
    assert.equal(config.coverV2Config().concepts, 1);
    return 'With COVER_V2_CONCEPTS absent, Number("") is 0 and the default becomes 1 instead of DEFAULT_CONCEPTS=2.';
  });

  await check('B09', 'Spelling verifier accepts incorrect or missing titles', async () => {
    const verify = load('lib/cover-v2/verify.ts');
    assert.equal(verify.compareTranscription('SMART', { title: 'ART' }).ok, true);
    assert.equal(verify.compareTranscription('UNRELATED ENGLISH TEXT', { title: 'नमस्ते दुनिया' }).ok, true);
    return 'Title ART passes transcription SMART; a Hindi title passes unrelated English text.';
  });

  await check('B10', 'Publish ZIP labels applied PNG artwork as cover.pdf', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    let packed;
    const c = client((q) => q.table === 'book_publish_packages'
      ? ok({ id: 'package', book_id: 'book', metadata_json: {} })
      : ok({ id: 'book', title: 'Book', book_type: 'sudoku', cover_key: 'covers/user/cover/0.png', config: {} }));
    c.auth = { getUser: async () => ({ data: { user: { id: 'user' } } }) };
    const route = load('app/api/publish-package/[id]/route.ts', {
      'next/server': { NextResponse: Response },
      '@/lib/supabase/server': { createSupabaseServerClient: async () => c },
      '@/lib/storage': { getBytes: async () => png },
      '@/lib/publishing': { buildPackageZip: async ({ assets }) => { packed = assets; return new Uint8Array(); } },
      '@/lib/export/pdf': {}, '@/lib/pdf/kdp-specs': {},
      '@/lib/util/rate-limit': { rateLimit: () => ({ ok: true }) },
    });
    await route.GET({}, { params: Promise.resolve({ id: 'package' }) });
    assert.equal(packed[0].name, 'cover.pdf'); assert.equal(packed[0].bytes[0], 137);
    return 'The ZIP receives name=cover.pdf but its bytes start with the PNG signature, not %PDF.';
  });

  await check('B11', 'Ebook page_count records chapter count instead of actual pages', async () => {
    let completed;
    const c = client((q) => {
      if (q.table === 'books' && q.op === 'insert') return ok({ id: 'book' });
      if (q.table === 'ebook_chapters') return ok(q.payload.map((_, i) => ({ id: `chapter-${i}` })));
      if (q.table === 'book_metadata') return ok({ book_id: 'book' });
      if (q.table === 'books') { completed = q.payload; return ok({ id: 'book' }); }
      return ok();
    });
    const ebook = load('lib/books/ebook-pipeline.ts', {
      '../supabase/admin': adminMock(c), '../supabase/errors': errors,
      '../storage': { putBytes: async () => {}, bookObjectKey: () => 'cover' },
      '../generators/ebook': { buildEbook: async () => ({ title: 'Book', chapters: [1, 2, 3].map((idx) => ({ idx, contentMd: 'long content '.repeat(5000) })), coverBytes: new Uint8Array(), keywords: [] }) },
      '../publishing/profile': { profileAuthor: () => 'Author', loadPublishingProfile: async () => ({}) },
      '../pdf/kdp-specs': { TRIM_SIZES: { '6x9': {} } },
    });
    await ebook.generateAndStoreEbook('user', { topic: 'Topic', author: 'Author' });
    assert.equal(completed.page_count, 3);
    return 'Three very long chapters are persisted as page_count=3, despite title/contents pages and flowing chapter pagination.';
  });

  await check('B12', 'Support attachments have no way to open from either ticket page', async () => {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const thread = load('components/support/ticket-thread.tsx');
    const html = renderToStaticMarkup(React.createElement(thread.TicketThread, { replies: [{
      id: 'reply', author_role: 'user', author_email: 'user@example.test', created_at: new Date().toISOString(),
      body: 'See screenshot', attachments: [{ key: 'support/user/screenshot.png', name: 'screenshot.png', size: 10 }],
    }] }));
    assert.ok(html.includes('screenshot.png')); assert.ok(!html.includes('href=') && !html.includes('<button'));
    return 'Both admin/user ticket pages use a shared thread that renders attachments only as non-clickable spans.';
  });

  await check('B13', 'Concurrent first subscription requests fail on unique(user_id)', async () => {
    let row = null;
    const c = client((q) => {
      if (q.op === 'select') return row ? ok({ ...row }) : { data: null, error: { code: 'PGRST116' } };
      if (q.table === 'subscriptions') {
        if (row) return { data: null, error: { code: '23505', message: 'duplicate key violates unique user_id' } };
        row = { ...q.payload }; return ok(row);
      }
      return ok();
    });
    const sub = subscription(c);
    const results = await Promise.allSettled([sub.getOrCreateSubscription('user'), sub.getOrCreateSubscription('user')]);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    return 'Two concurrent initial requests: one succeeds, the other throws duplicate key instead of returning the same subscription.';
  });

  await check('B14', 'Analytics failure refunds an already committed publishing package', async () => {
    let saved = false; let reserved = 0; let refunded = 0;
    const c = client((q) => q.table === 'books' ? ok({ id: 'book', title: 'Book', config: {} }) : (saved = true, ok({ id: 'pkg' })));
    c.auth = { getUser: async () => ({ data: { user: { id: 'user' } } }) };
    const fakeResponse = { json: (data, options) => ({ data, status: options?.status ?? 200 }) };
    const route = load('app/api/publish-package/route.ts', {
      'next/server': { NextResponse: fakeResponse }, '@/lib/supabase/server': { createSupabaseServerClient: async () => c },
      '@/lib/supabase/admin': adminMock(c), '@/lib/publishing': {
        loadPublishingProfile: async () => ({}), profileAuthor: () => 'Author', profileCopyright: () => '',
        generatePackageData: async () => ({ metadataJson: {}, keywords: { primary: [], longTail: [] }, categories: [], alternativeTitles: [] }),
      },
      '@/lib/billing': { reserve: async (_u, n) => { reserved += n; }, refund: async (_u, n) => { refunded += n; },
        recordUsage: async (_u, _a, _n, status) => { if (status === 'completed') throw new Error('analytics unavailable'); } },
      '@/lib/billing/guard': { assertFeature: async () => {}, billingErrorResponse: () => null },
      '@/lib/util/rate-limit': { rateLimit: () => ({ ok: true }) },
    });
    const res = await route.POST({ json: async () => ({ bookId: 'book' }) });
    assert.equal(saved, true); assert.equal(res.status, 500); assert.equal(reserved, refunded);
    return 'Package upsert succeeds, usage insert fails, response is 500 and the completed package gets fully refunded.';
  });

  await check('B15', 'Admin create-user fails after an active auth account is already created', async () => {
    let created = false; let removed = false;
    const c = client(() => ok());
    c.auth = { admin: { createUser: async () => { created = true; return ok({ user: { id: 'new-user' } }); },
      deleteUser: async () => { removed = true; return ok(); } } };
    const users = userModule(c, { applyOfferMeta: async () => { throw new Error('subscription unavailable'); } }, {});
    await assert.rejects(users.adminCreateUser({ userId: 'admin' }, { email: 'new@example.test', password: 'example-password' }));
    assert.equal(created, true); assert.equal(removed, false);
    return 'Offer delivery fails after createUser succeeds; an active confirmed account remains although the API reports failure.';
  });

  await check('B16', 'Queued generators still debit Unlimited customers', async () => {
    let requestedCost;
    const c = client(() => ok(), async (_name, args) => {
      requestedCost = args.p_credit_cost;
      return ok({ outcome: 'ok', job_id: 'job', balance: 96 });
    });
    const queue = load('lib/jobs/job-queue.ts', {
      '../supabase/admin': adminMock(c),
      '../billing/subscription': { getOrCreateSubscription: async () => ({ credits_remaining: 100, entitlements: { unlimited: true } }) },
      '../billing': { InsufficientCreditsError: class extends Error {} },
      './job-runner': { runJob: async () => {} },
    });
    await queue.createJob('user', { jobType: 'sudoku', bookType: 'sudoku', title: 'Book', input: { _cost: 4 } });
    assert.equal(requestedCost, 4);
    const sql = fs.readFileSync(path.join(root, 'supabase/migrations/0019_job_credit_integrity.sql'), 'utf8');
    const createRpc = sql.split('create or replace function public.job_create_with_reservation')[1].split('create or replace function public.job_retry')[0];
    assert.ok(createRpc.includes('v_balance := v_balance - v_cost'));
    assert.ok(!createRpc.includes('unlimited'));
    return 'An Unlimited subscription still passes p_credit_cost=4; the SQL RPC debits v_cost without checking unlimited.';
  });

  fs.writeFileSync(path.join(__dirname, 'reproduction-results.json'), JSON.stringify({
    date: '2026-10-16', method: 'Repository source executed with offline dependency doubles',
    reproduced: evidence.length, evidence,
  }, null, 2) + '\n');
  console.log(`\n${evidence.length} independent bug scenarios reproduced. This script confirms existing defects; it is not a regression-pass suite.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

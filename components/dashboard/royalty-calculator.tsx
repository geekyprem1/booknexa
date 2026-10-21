"use client";

import { useId, useMemo, useState } from "react";
import { MARKETPLACES, MARKETPLACE_ORDER, VERIFIED_AT, type MarketplaceId } from "@/lib/kdp/pricing-data";
import {
  formatMoney,
  minListPrice,
  normalizePages,
  recommendAll,
  recommendPrice,
  royalty,
} from "@/lib/kdp/royalty";
import { KDP_TRIM_OPTIONS, TRIM_SIZES, type TrimSize } from "@/lib/pdf/kdp-specs";

const FIELD = "mt-1 w-full rounded border border-rule-strong bg-paper-card px-3 py-2 text-sm";
const LABEL = "block text-sm font-medium text-ink-soft";

const isTrim = (t: string | undefined): t is TrimSize => Boolean(t && t in TRIM_SIZES);

/**
 * KDP paperback royalty calculator (black ink). Pure client-side math from
 * lib/kdp/royalty.ts. `compact` hides the all-marketplaces table (book detail card).
 */
export function RoyaltyCalculator({
  initialTrim,
  initialPages,
  compact = false,
}: {
  initialTrim?: string;
  initialPages?: number;
  compact?: boolean;
}) {
  const id = useId();
  const [trim, setTrim] = useState<TrimSize>(isTrim(initialTrim) ? initialTrim : "8.5x11");
  const [pagesInput, setPagesInput] = useState(String(initialPages ?? 100));
  const [mkt, setMkt] = useState<MarketplaceId>("com");
  const [priceInput, setPriceInput] = useState<string>("");
  const [expanded, setExpanded] = useState(false);

  const dims = TRIM_SIZES[trim];
  const pages = normalizePages(Number(pagesInput));
  const m = MARKETPLACES[mkt];
  const rec = useMemo(() => recommendPrice(mkt, dims, pages), [mkt, dims, pages]);
  const price = priceInput === "" ? rec.listPrice : Number(priceInput);
  const valid = Number.isFinite(price) && price > 0 && price <= m.maxPrice;
  const result = valid ? royalty(mkt, dims, pages, price, { expanded }) : null;
  const min = minListPrice(mkt, dims, pages);
  const all = useMemo(() => (compact ? [] : recommendAll(dims, pages)), [compact, dims, pages]);
  const step = m.decimals === 0 ? 1 : 0.01;

  const inFiftyBand = result && !expanded && result.rate === 0.5;
  const gain = inFiftyBand ? rec.royalty - result.royalty : 0;

  return (
    <div className="rounded-xl border border-rule bg-paper-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL} htmlFor={`${id}-trim`}>
          Trim size
          <select id={`${id}-trim`} className={FIELD} value={trim} onChange={(e) => setTrim(e.target.value as TrimSize)}>
            {KDP_TRIM_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
            {!KDP_TRIM_OPTIONS.some((t) => t.value === trim) && <option value={trim}>{trim.replace("x", '" × ')}"</option>}
          </select>
        </label>
        <label className={LABEL} htmlFor={`${id}-pages`}>
          Page count <span className="font-normal text-ink-muted">(24–828)</span>
          <input
            id={`${id}-pages`}
            type="number"
            inputMode="numeric"
            min={24}
            max={828}
            className={FIELD}
            value={pagesInput}
            onChange={(e) => setPagesInput(e.target.value)}
          />
        </label>
        <label className={LABEL} htmlFor={`${id}-mkt`}>
          Marketplace
          <select
            id={`${id}-mkt`}
            className={FIELD}
            value={mkt}
            onChange={(e) => {
              setMkt(e.target.value as MarketplaceId);
              setPriceInput("");
            }}
          >
            {MARKETPLACE_ORDER.map((k) => (
              <option key={k} value={k}>{MARKETPLACES[k].label} ({MARKETPLACES[k].currency})</option>
            ))}
          </select>
        </label>
        <label className={LABEL} htmlFor={`${id}-price`}>
          List price ({m.currency})
          <div className="flex gap-2">
            <input
              id={`${id}-price`}
              type="number"
              inputMode="decimal"
              min={0}
              max={m.maxPrice}
              step={step}
              className={FIELD}
              value={priceInput === "" ? String(rec.listPrice) : priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
            />
            {priceInput !== "" && (
              <button type="button" onClick={() => setPriceInput("")} className="mt-1 shrink-0 rounded border border-rule-strong px-3 text-xs font-medium hover:bg-paper">
                Use {formatMoney(mkt, rec.listPrice)}
              </button>
            )}
          </div>
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={expanded} onChange={(e) => setExpanded(e.target.checked)} className="h-4 w-4" />
        Expanded Distribution sale (40% royalty)
      </label>

      <div className="mt-5 grid gap-3 sm:grid-cols-4" aria-live="polite">
        <Stat label="Printing cost" value={formatMoney(mkt, result?.printingCost ?? rec.printingCost)} />
        <Stat label="Royalty rate" value={result ? `${Math.round(result.rate * 100)}%` : "—"} />
        <Stat label="You earn / sale" value={result ? formatMoney(mkt, result.royalty) : "—"} strong />
        <Stat label="KDP minimum price" value={formatMoney(mkt, min)} />
      </div>

      {!valid && <p role="alert" className="mt-3 text-sm text-clay">Enter a price between 0 and {formatMoney(mkt, m.maxPrice)}.</p>}
      {result?.belowMinimum && (
        <p role="alert" className="mt-3 text-sm text-clay">
          KDP won&apos;t accept this price. The minimum for this book is {formatMoney(mkt, min)}.
        </p>
      )}
      {inFiftyBand && !result.belowMinimum && gain > 0 && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This price is in KDP&apos;s 50% band. At {formatMoney(mkt, rec.listPrice)} you&apos;d earn{" "}
          {formatMoney(mkt, rec.royalty)} per sale, about {formatMoney(mkt, gain)} more.
        </p>
      )}

      {!compact && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="mb-2 text-left text-sm font-semibold text-ink">Recommended price in every store</caption>
            <thead className="border-b border-rule text-xs uppercase text-ink-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Store</th>
                <th scope="col" className="py-2 pr-3 font-medium">List price</th>
                <th scope="col" className="py-2 pr-3 font-medium">Rate</th>
                <th scope="col" className="py-2 pr-3 font-medium">Printing</th>
                <th scope="col" className="py-2 font-medium">You earn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {all.map((r) => (
                <tr key={r.marketplace}>
                  <th scope="row" className="py-2 pr-3 font-medium">{MARKETPLACES[r.marketplace].label}</th>
                  <td className="py-2 pr-3">{formatMoney(r.marketplace, r.listPrice)}</td>
                  <td className="py-2 pr-3">{Math.round(r.rate * 100)}%</td>
                  <td className="py-2 pr-3">{formatMoney(r.marketplace, r.printingCost)}</td>
                  <td className="py-2 font-semibold">{formatMoney(r.marketplace, r.royalty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-muted">
        Black ink paperback, white or cream paper. KDP rates verified {VERIFIED_AT}. Estimates only; confirm in KDP&apos;s
        Pricing tab before publishing.
      </p>
    </div>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`mt-0.5 ${strong ? "text-xl font-bold text-ink" : "text-base font-semibold text-ink-soft"}`}>{value}</div>
    </div>
  );
}

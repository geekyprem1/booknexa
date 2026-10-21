import { RoyaltyCalculator } from "@/components/dashboard/royalty-calculator";

export const metadata = { title: "Royalty Calculator · BookNexa" };

export default function RoyaltyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Royalty Calculator</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        See what each paperback actually earns per sale. On Amazon.com KDP pays 60% at $9.99 and up, but only 50% at
        $9.98 and below, then subtracts printing. A one-cent difference can halve your royalty.
      </p>
      <div className="mt-6">
        <RoyaltyCalculator />
      </div>
    </div>
  );
}

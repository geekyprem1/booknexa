import { PlannerBoard } from "@/components/dashboard/planner/planner-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Slot Planner · BookNexa" };

export default function PlannerPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Slot Planner</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        KDP now gives every account 2 new titles per format each week. Plan which finished book takes each slot, keep
        series volumes in order, and mark books published once they go live.
      </p>
      <PlannerBoard />
    </div>
  );
}

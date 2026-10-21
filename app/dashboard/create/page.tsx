import { Suspense } from "react";
import { redirect } from "next/navigation";
import { resolveAdmin } from "@/lib/admin";
import { CreateWizard } from "@/components/dashboard/create-wizard";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  // Story Book is admin-only — non-admins can't deep-link into its wizard.
  if (sp.type === "story") {
    const admin = await resolveAdmin();
    if (!admin) redirect("/dashboard");
  }
  // Remount the wizard whenever the deep-link changes (e.g. a generator's ?type=
  // vs. plain Book Studio) so its step/selection resets instead of sticking
  // to the previous generator until a manual page refresh.
  const wizardKey = `${sp.type ?? ""}|${sp.theme ?? ""}|${sp.shelf ?? ""}`;
  return (
    <Suspense fallback={null}>
      <CreateWizard key={wizardKey} />
    </Suspense>
  );
}

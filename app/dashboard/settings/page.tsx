import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SettingsForm, type ProfileValues } from "@/components/dashboard/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name, author_name, pen_name, publisher_name, language, trim_size, default_price, ai_disclosure, copyright_notice")
    .single();

  const initial: ProfileValues = {
    authorName: data?.author_name ?? data?.full_name ?? "",
    penName: data?.pen_name ?? "",
    publisherName: data?.publisher_name ?? "",
    language: data?.language ?? "English",
    trimSize: data?.trim_size ?? "8.5x11",
    defaultPrice: data?.default_price != null ? String(data.default_price) : "",
    aiDisclosure: data?.ai_disclosure ?? "",
    copyrightNotice: data?.copyright_notice ?? "",
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Author &amp; Publishing Profile</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Set your publishing defaults once — every book and publish package inherits them.
      </p>
      <div className="mt-6">
        <SettingsForm initial={initial} />
      </div>
    </div>
  );
}

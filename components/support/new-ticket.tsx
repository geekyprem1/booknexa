"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  { v: "general", l: "General" },
  { v: "billing", l: "Billing" },
  { v: "technical", l: "Technical" },
  { v: "account", l: "Account" },
  { v: "feature_request", l: "Feature Request" },
  { v: "bug", l: "Bug Report" },
];
const PRIORITIES = ["low", "normal", "high", "urgent"];

interface Attachment { name: string; key: string; size: number }

export function NewTicket() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/support/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      setAttachments((a) => [...a, { name: j.name, key: j.key, size: j.size }]);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, category, priority, body, attachments }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setSubject(""); setBody(""); setAttachments([]); setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg btn-nexa px-5 py-2.5 text-sm font-medium text-white">
        + New Ticket
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-rule bg-paper-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-ink-soft">New Support Ticket</h2>
      <div className="mt-4 space-y-3">
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-lg border border-rule-strong px-3 py-2 text-sm" />
        <div className="flex gap-3">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 rounded-lg border border-rule-strong px-3 py-2 text-sm">
            {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="flex-1 rounded-lg border border-rule-strong px-3 py-2 text-sm capitalize">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Describe your issue…" className="w-full rounded-lg border border-rule-strong px-3 py-2 text-sm" />

        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-rule-strong px-3 py-1.5 text-xs font-medium hover:bg-paper">
            {uploading ? "Uploading…" : "📎 Attach file"}
            <input type="file" className="hidden" onChange={upload} disabled={uploading} />
          </label>
          {attachments.map((a) => (
            <span key={a.key} className="rounded bg-paper-deep px-2 py-1 text-[11px] text-ink-muted">{a.name}</span>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={submit} disabled={busy || !subject.trim() || !body.trim()} className="rounded-lg btn-nexa px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Submitting…" : "Submit Ticket"}
          </button>
          <button onClick={() => setOpen(false)} className="text-sm text-ink-muted hover:underline">Cancel</button>
          {err && <span className="text-xs text-clay">{err}</span>}
        </div>
      </div>
    </div>
  );
}

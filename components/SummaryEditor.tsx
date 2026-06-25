"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Summary } from "@/lib/types";

export function SummaryEditor({
  chapter,
  initialSummary,
  canEdit = false,
}: {
  book: { title: string; author: string | null };
  chapter: { id: string; chapter_number: number; title: string | null };
  initialSummary: Summary | null;
  /** Admins can write/edit; members get a read-only view. */
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(initialSummary);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Summaries are human-written and live in `edited_content`.
  const displayed = summary?.edited_content ?? null;

  function startEditing() {
    setDraftText(summary?.edited_content ?? "");
    setEditing(true);
    setError(null);
  }

  async function saveSummary() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("summaries")
      .upsert(
        {
          chapter_id: chapter.id,
          edited_content: draftText,
          edited_by: user?.id ?? null,
        },
        { onConflict: "chapter_id" },
      )
      .select()
      .single<Summary>();

    if (error || !data) {
      setError(error?.message ?? "Failed to save");
      setBusy(false);
      return;
    }

    setSummary(data);
    setEditing(false);
    setBusy(false);
    router.refresh();
  }

  if (editing && canEdit) {
    return (
      <div className="space-y-3">
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          rows={8}
          placeholder="Write the chapter summary…"
          className="field leading-relaxed"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveSummary}
            disabled={busy}
            className="btn btn-primary"
          >
            {busy ? "Saving…" : "Save summary"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="btn btn-ghost"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayed ? (
        <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">
          {displayed}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No summary yet.</p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={startEditing}
          disabled={busy}
          className="btn btn-ghost"
        >
          {displayed ? "Edit summary" : "Write summary"}
        </button>
      )}
    </div>
  );
}

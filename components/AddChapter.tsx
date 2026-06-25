"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AddChapter({
  bookId,
  nextChapterNumber,
}: {
  bookId: string;
  nextChapterNumber: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(nextChapterNumber);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.from("chapters").insert({
      book_id: bookId,
      chapter_number: number,
      title: title.trim() || null,
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    setTitle("");
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        Add chapter
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label htmlFor="ch-num" className="label block text-xs">
          No.
        </label>
        <input
          id="ch-num"
          type="number"
          min={1}
          required
          value={number}
          onChange={(e) => setNumber(Number(e.target.value))}
          className="field w-16"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="ch-title" className="label block text-xs">
          Title (optional)
        </label>
        <input
          id="ch-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="field w-48"
        />
      </div>
      <button type="submit" disabled={busy} className="btn btn-primary">
        {busy ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(false)}
        className="btn btn-ghost"
      >
        Cancel
      </button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </form>
  );
}

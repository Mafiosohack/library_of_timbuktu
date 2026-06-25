"use client";

import { useState } from "react";

/**
 * Requests a signed download URL by book ID, then navigates the browser to it.
 * The file streams directly from Supabase Storage — never through our server.
 */
export function DownloadButton({ bookId }: { bookId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/download-url?bookId=${encodeURIComponent(bookId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Download failed");
      window.location.href = data.signedUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="btn btn-ghost"
      >
        {loading ? "Preparing…" : "Download"}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

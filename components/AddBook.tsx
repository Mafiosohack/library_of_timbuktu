"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BOOKS_BUCKET,
  COVERS_BUCKET,
  BUCKET_CONFIG,
  bookFormatFromFilename,
  extensionOf,
  type StorageBucket,
} from "@/lib/constants";

const BOOK_MAX_MB = Math.round(BUCKET_CONFIG.books.maxBytes / (1024 * 1024));
const COVER_MAX_MB = Math.round(BUCKET_CONFIG.covers.maxBytes / (1024 * 1024));

/** Validate locally, get a signed URL, upload directly to Storage; return the path. */
async function uploadToBucket(
  bucket: StorageBucket,
  file: File,
): Promise<string> {
  const cfg = BUCKET_CONFIG[bucket];
  if (!cfg.formats.includes(extensionOf(file.name))) {
    throw new Error(`Unsupported file type. Allowed: ${cfg.label}.`);
  }
  if (file.size > cfg.maxBytes) {
    throw new Error(
      `File exceeds the ${Math.round(cfg.maxBytes / (1024 * 1024))}MB limit.`,
    );
  }

  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, filename: file.name, fileSize: file.size }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not start upload");

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(data.path, data.token, file);
  if (error) throw new Error(error.message);

  return data.path as string;
}

export function AddBook() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [shareable, setShareable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setAuthor("");
    setShareable(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    if (coverRef.current) coverRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const file = fileRef.current?.files?.[0];
    const cover = coverRef.current?.files?.[0];

    if (!file) {
      setError("Choose a book file to upload.");
      return;
    }
    const format = bookFormatFromFilename(file.name);
    if (!format) {
      setError("Unsupported book file. Allowed: PDF, EPUB, MOBI.");
      return;
    }

    setBusy(true);
    try {
      const storagePath = await uploadToBucket(BOOKS_BUCKET, file);
      const coverPath = cover
        ? await uploadToBucket(COVERS_BUCKET, cover)
        : null;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error: insertError } = await supabase.from("books").insert({
        title: title.trim(),
        author: author.trim() || null,
        storage_path: storagePath,
        cover_path: coverPath,
        file_size_bytes: file.size,
        format,
        shareable,
        uploaded_by: user?.id,
      });
      if (insertError) throw new Error(insertError.message);

      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add book");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
        Add a book
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card w-full max-w-md space-y-4 p-5">
      <h2 className="text-xl font-semibold">Add a book</h2>

      <div className="space-y-1.5">
        <label htmlFor="title" className="label">
          Title
        </label>
        <input
          id="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="field"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="author" className="label">
          Author <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id="author"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="field"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="file" className="label">
          Book file{" "}
          <span className="font-normal text-muted-foreground">
            (PDF, EPUB, MOBI · max {BOOK_MAX_MB}MB)
          </span>
        </label>
        <input
          id="file"
          ref={fileRef}
          type="file"
          accept=".pdf,.epub,.mobi"
          required
          className="block w-full text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:font-semibold file:text-accent-foreground"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cover" className="label">
          Cover image{" "}
          <span className="font-normal text-muted-foreground">
            (optional · JPEG/PNG/WebP · max {COVER_MAX_MB}MB)
          </span>
        </label>
        <input
          id="cover"
          ref={coverRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          className="block w-full text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:font-semibold file:text-foreground"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={shareable}
          onChange={(e) => setShareable(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        <span>
          Shareable{" "}
          <span className="text-muted-foreground">
            — members may download (only if you have the rights to distribute it)
          </span>
        </span>
      </label>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "Uploading…" : "Add book"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="btn btn-ghost"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

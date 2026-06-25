/**
 * Shared constraints derived from the project spec and the Supabase free tier.
 * Used by both the client (pre-flight checks) and the server (authoritative
 * validation before issuing a signed upload URL).
 */

// Supabase Storage buckets. Two private buckets with different content rules.
export const BOOKS_BUCKET = "books";
export const COVERS_BUCKET = "covers";

// Server-side allowlist — never pass a client-supplied bucket straight through.
export const STORAGE_BUCKETS = [BOOKS_BUCKET, COVERS_BUCKET] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

export function isStorageBucket(value: unknown): value is StorageBucket {
  return (
    typeof value === "string" &&
    (STORAGE_BUCKETS as readonly string[]).includes(value)
  );
}

// Per-bucket validation config: allowed file extensions + per-file size cap.
export const BUCKET_CONFIG: Record<
  StorageBucket,
  { formats: readonly string[]; maxBytes: number; label: string }
> = {
  books: {
    formats: ["pdf", "epub", "mobi"],
    maxBytes: 50 * 1024 * 1024, // free-tier per-file cap
    label: "PDF, EPUB, MOBI",
  },
  covers: {
    formats: ["jpg", "jpeg", "png", "webp"],
    maxBytes: 5 * 1024 * 1024,
    label: "JPEG, PNG, WebP",
  },
};

// Book formats stored on the `books.format` column.
export const ALLOWED_BOOK_FORMATS = BUCKET_CONFIG.books.formats;
export type BookFormat = "pdf" | "epub" | "mobi";

// Free-tier total storage budget (1GB). Used to warn as the library fills up.
export const TOTAL_STORAGE_BUDGET_BYTES = 1 * 1024 * 1024 * 1024;

// Signed URL lifetimes (seconds).
export const UPLOAD_URL_TTL_SECONDS = 60 * 5;
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 5;

/** Lowercased file extension, or "" if none. */
export function extensionOf(filename: string): string {
  return filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
}

/** Returns the canonical book format for a filename, or null if not allowed. */
export function bookFormatFromFilename(filename: string): BookFormat | null {
  const ext = extensionOf(filename);
  return (ALLOWED_BOOK_FORMATS as readonly string[]).includes(ext)
    ? (ext as BookFormat)
    : null;
}

/** Validates a filename + size against a bucket's rules. */
export function validateForBucket(
  bucket: StorageBucket,
  filename: string,
  fileSize: number,
): { ok: true; ext: string } | { ok: false; error: string; status: number } {
  const cfg = BUCKET_CONFIG[bucket];
  const ext = extensionOf(filename);
  if (!cfg.formats.includes(ext)) {
    return {
      ok: false,
      status: 415,
      error: `Unsupported file type. Allowed: ${cfg.label}.`,
    };
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { ok: false, status: 400, error: "A valid file size is required." };
  }
  if (fileSize > cfg.maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `File exceeds the ${Math.round(cfg.maxBytes / (1024 * 1024))}MB limit for ${bucket}.`,
    };
  }
  return { ok: true, ext };
}

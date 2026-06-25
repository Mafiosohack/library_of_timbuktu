import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  BOOKS_BUCKET,
  COVERS_BUCKET,
  DOWNLOAD_URL_TTL_SECONDS,
  isStorageBucket,
} from "@/lib/constants";
import type { Book } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Issues a short-lived signed download URL for a book's file or cover.
 *
 * Looked up by internal book UUID only — the client never supplies a path or
 * filename, so there is no path-traversal surface. The bucket is validated
 * against an allowlist. For the book file, the `shareable` flag is enforced
 * server-side: a non-shareable book returns 403 regardless of role (content
 * rights are gated by the data, not by trusting the caller).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const bookId = url.searchParams.get("bookId");
  const bucket = url.searchParams.get("bucket") ?? BOOKS_BUCKET;

  if (!bookId) {
    return NextResponse.json({ error: "bookId is required" }, { status: 400 });
  }
  if (!isStorageBucket(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  const { data: book, error } = await supabase
    .from("books")
    .select("storage_path, cover_path, title, format, shareable")
    .eq("id", bookId)
    .single<
      Pick<Book, "storage_path" | "cover_path" | "title" | "format" | "shareable">
    >();

  if (error || !book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const service = createServiceClient();

  if (bucket === COVERS_BUCKET) {
    if (!book.cover_path) {
      return NextResponse.json({ error: "No cover" }, { status: 404 });
    }
    const { data: signed, error: signError } = await service.storage
      .from(COVERS_BUCKET)
      .createSignedUrl(book.cover_path, DOWNLOAD_URL_TTL_SECONDS);
    if (signError || !signed) {
      return NextResponse.json({ error: "Could not sign cover" }, { status: 500 });
    }
    return NextResponse.json({ signedUrl: signed.signedUrl });
  }

  // bucket === books — content-rights gate.
  if (!book.shareable) {
    return NextResponse.json(
      { error: "This book is not shareable." },
      { status: 403 },
    );
  }

  const safeName =
    book.title.replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim() || "book";
  const { data: signed, error: signError } = await service.storage
    .from(BOOKS_BUCKET)
    .createSignedUrl(book.storage_path, DOWNLOAD_URL_TTL_SECONDS, {
      download: `${safeName}.${book.format}`,
    });

  if (signError || !signed) {
    return NextResponse.json(
      { error: "Could not create download URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({ signedUrl: signed.signedUrl });
}

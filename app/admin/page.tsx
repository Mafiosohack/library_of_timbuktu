import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { AddBook } from "@/components/AddBook";
import { Reveal } from "@/components/Reveal";
import { removeBook } from "./actions";
import {
  COVERS_BUCKET,
  DOWNLOAD_URL_TTL_SECONDS,
  TOTAL_STORAGE_BUDGET_BYTES,
} from "@/lib/constants";
import type { Book } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectedFrom=/admin");
  if (user.role !== "admin") redirect("/library");

  const supabase = await createClient();
  const { data: books } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });

  const list = (books ?? []) as Book[];

  // Sign cover URLs server-side (covers bucket is private).
  const service = createServiceClient();
  const coverUrls = new Map<string, string>();
  await Promise.all(
    list
      .filter((b) => b.cover_path)
      .map(async (b) => {
        const { data } = await service.storage
          .from(COVERS_BUCKET)
          .createSignedUrl(b.cover_path!, DOWNLOAD_URL_TTL_SECONDS);
        if (data?.signedUrl) coverUrls.set(b.id, data.signedUrl);
      }),
  );

  const usedBytes = list.reduce((s, b) => s + (b.file_size_bytes ?? 0), 0);
  const usedPct = (usedBytes / TOTAL_STORAGE_BUDGET_BYTES) * 100;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="eyebrow">Curator</p>
          <h1 className="text-4xl font-semibold">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatBytes(usedBytes)} of{" "}
            {formatBytes(TOTAL_STORAGE_BUDGET_BYTES)} used ·{" "}
            {usedPct.toFixed(0)}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/library" className="btn btn-ghost">
            View library
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mb-10">
        <AddBook />
      </section>

      <h2 className="mb-4 text-2xl font-semibold">Books</h2>
      {list.length === 0 ? (
        <div className="card p-8 text-center text-muted-foreground">
          No books yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((book, i) => (
            <li key={book.id}>
              <Reveal
                delay={i * 50}
                className="card card-hover flex items-center gap-4 p-4"
              >
              <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-surface-2">
                {coverUrls.has(book.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrls.get(book.id)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-medium">
                  {book.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {book.author || "Unknown author"} ·{" "}
                  <span className="eyebrow align-middle">{book.format}</span> ·{" "}
                  {formatBytes(book.file_size_bytes)}
                </p>
                <span
                  className={
                    book.shareable ? "badge badge-accent mt-1" : "badge mt-1"
                  }
                >
                  {book.shareable ? "Shareable" : "Not shareable"}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/admin/${book.id}`} className="btn btn-ghost">
                  Summaries
                </Link>
                <form action={removeBook}>
                  <input type="hidden" name="bookId" value={book.id} />
                  <button
                    type="submit"
                    className="btn btn-ghost text-destructive"
                  >
                    Remove
                  </button>
                </form>
              </div>
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

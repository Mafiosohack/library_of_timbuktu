import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { DownloadButton } from "@/components/DownloadButton";
import { Reveal } from "@/components/Reveal";
import { COVERS_BUCKET, DOWNLOAD_URL_TTL_SECONDS } from "@/lib/constants";
import type { Book } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default async function LibraryPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: books } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });

  const list = (books ?? []) as Book[];

  // Covers live in a private bucket — sign their URLs server-side.
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

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="eyebrow">The collection</p>
          <h1 className="text-4xl font-semibold">Library of Timbuktu</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {user?.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "admin" && (
            <Link href="/admin" className="btn btn-ghost">
              Admin
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-lg text-muted-foreground">The shelves are empty.</p>
          {user?.role === "admin" && (
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first volume from the{" "}
              <Link href="/admin" className="text-accent hover:underline">
                admin page
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((book, i) => (
            <li key={book.id}>
              <Reveal delay={i * 60} className="group flex h-full flex-col">
                <Link
                  href={`/library/${book.id}`}
                  className="card card-hover block aspect-[2/3] overflow-hidden p-0 group-hover:-translate-y-1"
                >
                  {coverUrls.has(book.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverUrls.get(book.id)}
                      alt={`Cover of ${book.title}`}
                      className="h-full w-full object-cover group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-surface-2 p-4 text-center">
                      <span className="font-display text-lg leading-snug text-foreground/80">
                        {book.title}
                      </span>
                      <span className="eyebrow mt-2">{book.format}</span>
                    </div>
                  )}
                </Link>
                <div className="mt-3 min-w-0">
                  <Link
                    href={`/library/${book.id}`}
                    className="block truncate font-display text-lg font-medium underline-offset-4 hover:text-accent hover:underline"
                  >
                    {book.title}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    {book.author || "Unknown author"}
                  </p>
                  <div className="mt-2">
                    {book.shareable ? (
                      <DownloadButton bookId={book.id} />
                    ) : (
                      <span className="badge">Reference only</span>
                    )}
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

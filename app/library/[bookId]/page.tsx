import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { DownloadButton } from "@/components/DownloadButton";
import { SummaryEditor } from "@/components/SummaryEditor";
import { Reveal } from "@/components/Reveal";
import { COVERS_BUCKET, DOWNLOAD_URL_TTL_SECONDS } from "@/lib/constants";
import type { Book, Chapter, Summary } from "@/lib/types";

export const dynamic = "force-dynamic";

type ChapterRow = Chapter & { summaries: Summary[] };

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .single<Book>();

  if (!book) notFound();

  let coverUrl: string | null = null;
  if (book.cover_path) {
    const { data } = await createServiceClient()
      .storage.from(COVERS_BUCKET)
      .createSignedUrl(book.cover_path, DOWNLOAD_URL_TTL_SECONDS);
    coverUrl = data?.signedUrl ?? null;
  }

  const { data: chapterRows } = await supabase
    .from("chapters")
    .select("*, summaries(*)")
    .eq("book_id", bookId)
    .order("chapter_number", { ascending: true });

  const chapters = (chapterRows ?? []) as ChapterRow[];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href="/library"
        className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-accent hover:underline"
      >
        ← Back to the library
      </Link>

      <header className="mt-5 mb-10 flex flex-wrap items-start gap-6 border-b border-border pb-6">
        {coverUrl ? (
          <div className="h-40 w-28 shrink-0 overflow-hidden rounded-md bg-surface-2 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt={`Cover of ${book.title}`}
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="eyebrow">
            {book.author || "Unknown author"} · {book.format}
          </p>
          <h1 className="text-4xl font-semibold leading-tight">{book.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {book.shareable ? (
              <DownloadButton bookId={book.id} />
            ) : (
              <span className="badge">Reference only · not shareable</span>
            )}
            {user?.role === "admin" && (
              <Link href={`/admin/${book.id}`} className="btn btn-ghost">
                Manage summaries
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Chapter summaries</h2>

        {chapters.length === 0 ? (
          <div className="card p-8 text-center text-muted-foreground">
            No chapter summaries yet.
          </div>
        ) : (
          <ul className="space-y-5">
            {chapters.map((chapter, i) => (
              <li key={chapter.id}>
                <Reveal delay={i * 70} className="card card-hover p-5">
                  <h3 className="mb-3 text-xl font-medium">
                    <span className="eyebrow mr-2 align-middle">
                      Ch. {chapter.chapter_number}
                    </span>
                    {chapter.title}
                  </h3>
                  <SummaryEditor
                    book={{ title: book.title, author: book.author }}
                    chapter={{
                      id: chapter.id,
                      chapter_number: chapter.chapter_number,
                      title: chapter.title,
                    }}
                    initialSummary={chapter.summaries?.[0] ?? null}
                  />
                </Reveal>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

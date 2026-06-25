import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { AddChapter } from "@/components/AddChapter";
import { SummaryEditor } from "@/components/SummaryEditor";
import type { Book, Chapter, Summary } from "@/lib/types";

export const dynamic = "force-dynamic";

type ChapterRow = Chapter & { summaries: Summary[] };

export default async function AdminBookPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/library");

  const { bookId } = await params;
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .single<Book>();
  if (!book) notFound();

  const { data: chapterRows } = await supabase
    .from("chapters")
    .select("*, summaries(*)")
    .eq("book_id", bookId)
    .order("chapter_number", { ascending: true });
  const chapters = (chapterRows ?? []) as ChapterRow[];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href="/admin"
        className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-accent hover:underline"
      >
        ← Back to admin
      </Link>

      <header className="mt-5 mb-10 border-b border-border pb-6">
        <p className="eyebrow">Summary editor</p>
        <h1 className="text-4xl font-semibold leading-tight">{book.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {book.author || "Unknown author"}
        </p>
      </header>

      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Chapters</h2>
          <AddChapter
            bookId={book.id}
            nextChapterNumber={
              chapters.length
                ? Math.max(...chapters.map((c) => c.chapter_number)) + 1
                : 1
            }
          />
        </div>

        {chapters.length === 0 ? (
          <div className="card p-8 text-center text-muted-foreground">
            No chapters yet. Add one to start drafting summaries.
          </div>
        ) : (
          <ul className="space-y-5">
            {chapters.map((chapter) => (
              <li key={chapter.id} className="card p-5">
                <h3 className="mb-3 text-xl font-medium">
                  <span className="eyebrow mr-2 align-middle">
                    Ch. {chapter.chapter_number}
                  </span>
                  {chapter.title}
                </h3>
                <SummaryEditor
                  canEdit
                  book={{ title: book.title, author: book.author }}
                  chapter={{
                    id: chapter.id,
                    chapter_number: chapter.chapter_number,
                    title: chapter.title,
                  }}
                  initialSummary={chapter.summaries?.[0] ?? null}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { BOOKS_BUCKET, COVERS_BUCKET } from "@/lib/constants";

/**
 * Removes a book: deletes the DB row (cascades to chapters/summaries) and both
 * Storage objects (book file + cover). Admin-only. Uses the service client for
 * the privileged storage deletes after verifying the caller's role.
 */
export async function removeBook(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new Error("Admins only");
  }

  const bookId = formData.get("bookId");
  if (typeof bookId !== "string" || !bookId) {
    throw new Error("bookId is required");
  }

  const service = createServiceClient();

  const { data: book } = await service
    .from("books")
    .select("storage_path, cover_path")
    .eq("id", bookId)
    .single<{ storage_path: string; cover_path: string | null }>();

  if (book) {
    if (book.storage_path) {
      await service.storage.from(BOOKS_BUCKET).remove([book.storage_path]);
    }
    if (book.cover_path) {
      await service.storage.from(COVERS_BUCKET).remove([book.cover_path]);
    }
  }

  // Deleting the row cascades to chapters and summaries.
  await service.from("books").delete().eq("id", bookId);

  revalidatePath("/admin");
  revalidatePath("/library");
}

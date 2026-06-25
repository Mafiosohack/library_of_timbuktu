import type { BookFormat } from "@/lib/constants";

export type Role = "admin" | "member";

export interface Profile {
  id: string;
  role: Role;
}

export interface Book {
  id: string;
  title: string;
  author: string | null;
  storage_path: string;
  cover_path: string | null;
  file_size_bytes: number | null;
  format: BookFormat;
  shareable: boolean;
  uploaded_by: string;
  created_at: string;
}

export interface Chapter {
  id: string;
  book_id: string;
  chapter_number: number;
  title: string | null;
}

export interface Summary {
  id: string;
  chapter_id: string;
  ai_draft: string | null;
  edited_content: string | null;
  edited_by: string | null;
  updated_at: string;
}

/** A chapter joined with its single summary row (if one exists). */
export interface ChapterWithSummary extends Chapter {
  summary: Summary | null;
}

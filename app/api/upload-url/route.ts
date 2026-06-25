import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isStorageBucket, validateForBucket } from "@/lib/constants";

export const runtime = "nodejs";

interface UploadUrlBody {
  bucket?: string;
  filename?: string;
  fileSize?: number;
}

/**
 * Issues a signed Storage upload URL for an admin to upload a file directly to
 * a private bucket.
 *
 * The file is uploaded DIRECTLY from the client to Supabase Storage using the
 * returned signed URL — it never passes through this route (Vercel caps API
 * request bodies at 4.5MB). The bucket is validated against an allowlist (never
 * passed straight through). Format and size are validated per-bucket. The
 * storage path is a server-generated UUID, never the user-supplied filename, to
 * avoid path traversal.
 *
 * This route does NOT create the book row — the admin page inserts it (under
 * RLS) once both the book file and cover have uploaded successfully.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: UploadUrlBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isStorageBucket(body.bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }
  const filename = body.filename?.trim();
  if (!filename) {
    return NextResponse.json({ error: "Filename is required" }, { status: 400 });
  }

  const check = validateForBucket(body.bucket, filename, body.fileSize ?? NaN);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  // Server-generated, opaque storage path. No user-supplied path/filename.
  const storagePath = `${user.id}/${randomUUID()}.${check.ext}`;

  const service = createServiceClient();
  const { data: signed, error: signError } = await service.storage
    .from(body.bucket)
    .createSignedUploadUrl(storagePath);

  if (signError || !signed) {
    return NextResponse.json(
      { error: "Could not create upload URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    bucket: body.bucket,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
  });
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface SignupBody {
  email?: string;
  password?: string;
  code?: string;
}

/**
 * Public sign-up gated by a shared invite code.
 *
 * The code is checked server-side against SIGNUP_INVITE_CODE (never exposed to
 * the client). On success the account is created via the Supabase admin API
 * (service role), so Supabase's own public-signup endpoint can stay DISABLED —
 * this route is the only door, and it requires the code. New users get the
 * default 'member' role via the on-signup trigger.
 */
export async function POST(request: Request) {
  let body: SignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const code = (body.code ?? "").trim();

  const expected = process.env.SIGNUP_INVITE_CODE?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Sign-ups aren't configured yet. Ask the owner." },
      { status: 503 },
    );
  }
  if (code !== expected) {
    return NextResponse.json({ error: "Invalid invite code." }, { status: 403 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const service = createServiceClient();
  const { error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no confirmation email needed — code already gated entry
  });

  if (error) {
    const exists = /already|registered|exists/i.test(error.message);
    return NextResponse.json(
      {
        error: exists
          ? "That email is already registered — try signing in."
          : "Could not create the account.",
      },
      { status: exists ? 409 : 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

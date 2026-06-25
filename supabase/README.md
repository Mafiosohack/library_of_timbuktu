# Supabase setup

The schema, RLS, and Storage policies live in `migrations/0001_init.sql`.

## Option A — Local development with the Supabase CLI (Docker)

Docker is **dev-only** here. Production runs on hosted Supabase; the CLI uses
Docker Compose to run a local mirror of Postgres/Auth/Storage so you can build
and test schema, uploads, and RLS without touching the hosted free-tier quota.

```bash
npm install -g supabase
supabase init        # once, in the repo root
supabase start       # spins up local Postgres/Auth/Storage via Docker
supabase status      # prints local API URL + anon/service-role keys + Studio URL
```

Point `.env.local` at the values from `supabase status` (the local API URL and
keys). The migration in `migrations/` is applied automatically on `supabase
start` / `supabase db reset`.

When ready to ship schema to the hosted project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push     # applies migrations/ to the hosted project
```

## Option B — Hosted project only (no Docker)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL Editor** → paste `migrations/0001_init.sql` → **Run**. This creates the
   `profiles` / `books` / `chapters` / `summaries` tables, role-based RLS, the
   private `books` and `covers` buckets, and their policies.

## Required for both options

### Disable public signup
**Authentication → Providers → Email** → turn **"Allow new users to sign up"
OFF**. Members are added by invite only.

### Invite members
**Authentication → Users → Invite user**. A `profiles` row (role `member`) is
created automatically by a trigger on signup.

### Promote yourself to admin
New users default to `member`. Make the first user an admin from the SQL editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Admins get `/admin` (add/remove books, write summaries). Members get `/library`
(browse, read summaries, download books marked **shareable**).

### Copy keys into `.env.local`
**Project Settings → API** (hosted) or `supabase status` (local):
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only — never expose)

## Notes
- Both `books` and `covers` buckets are **private**; files are only reachable
  through server-issued signed URLs. Storage enforces 50MB/file (books) and
  5MB/file (covers); the `/api/upload-url` route additionally validates format
  and size, and only admins can obtain an upload URL.
- Book downloads are gated by `books.shareable` — `/api/download-url` returns
  403 for non-shareable books regardless of role (content-rights enforcement).

# Deployment guide

This project deploys as a Cloudflare Pages site with Pages Functions and a D1 database. The public deployment uses a signed three-day preview lock.

## 1. Prerequisites

- Cloudflare account
- Node.js 20+
- Wrangler 4 (`npm install` installs the pinned version locally)
- A GitHub repository for source control

## 2. Create the database

```bash
npx wrangler d1 create biziq-crm
```

Copy the returned database ID into `wrangler.jsonc` under `d1_databases[0].database_id`.

Apply the schema:

```bash
npx wrangler d1 execute biziq-crm --remote --file=migrations/0001_init.sql
npx wrangler d1 execute biziq-crm --remote --file=migrations/0002_lead_note.sql
```

## 3. Create the Pages project

```bash
npx wrangler pages project create biziq --production-branch main
```

## 4. Upload secrets

Generate three independent random strings. The admin password can be shorter but should be unique to this demo.

```bash
npx wrangler pages secret put DEMO_TRIAL_SECRET --project-name biziq
npx wrangler pages secret put ADMIN_SESSION_SECRET --project-name biziq
npx wrangler pages secret put ADMIN_PASSWORD_SECRET --project-name biziq
```

Never commit `.dev.vars`. The example file only lists variable names.

## 5. Deploy

```bash
npm run deploy
```

Or run directly:

```bash
npx wrangler pages deploy . --project-name biziq --branch main
```

The site becomes available at `https://biziq.pages.dev/`.

## 6. Verify

- `GET /api/health` returns `ok: true` and `storage: "d1-backend"`.
- First page visit returns a signed `biziq_trial` cookie.
- A valid cookie does not receive a second cookie.
- A tampered cookie redirects page requests to `/trial-ended` and returns HTTP 403 for API requests.
- `/api/admin/me` returns `signedIn: false` before login.
- Login with the owner password sets `biziq_admin`, an HttpOnly, SameSite=Lax, Secure cookie.
- `/api/leads` returns HTTP 401 without admin session.

## 7. Local development

```bash
cp .dev.vars.example .dev.vars
# Fill in the three values.
npx wrangler d1 execute biziq-crm --local --file=migrations/0001_init.sql
npx wrangler d1 execute biziq-crm --local --file=migrations/0002_lead_note.sql
npm run dev
```

Open `http://localhost:8790`.

## 8. Optional local model

```bash
ollama pull llama3.2
npm run bridge
```

The bridge binds to `127.0.0.1:8789`. It is not exposed to the internet. The public page can reach only that loopback port because of the CSP in `_headers`.

## 9. Rotating secrets

Upload a new value with the same `wrangler pages secret put` command. The next deployment picks it up. Rotating `ADMIN_SESSION_SECRET` signs out all existing admin sessions. Rotating `ADMIN_PASSWORD_SECRET` changes the password. Rotating `DEMO_TRIAL_SECRET` invalidates all active preview cookies.

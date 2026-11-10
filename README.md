# MONEX Academy

**Where money is made.** A global platform for finding business ideas with real numbers,
the people to build them, and the skills to launch.

The single source of truth for what gets built is the Master Prompt (kept in the claude.ai Project).

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript strict · Tailwind CSS v4 · Radix UI (shadcn/ui style) ·
Motion · next-intl · Netlify. Upcoming: Supabase, Cloudflare R2/Turnstile, Resend, Lemon Squeezy, Sentry.

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run check` | Type check + lint |

## Structure

```
app/[locale]/(public)   public pages
app/[locale]/(auth)     login, signup, reset password
components/ui           base components (button, card, badge, input, term)
components/layout       header, footer, mobile menu, theme toggle
components/brand        logo + mark (paths generated from public/brand/monex-academy-logo.svg)
i18n/                   next-intl routing and request config
messages/en.json        every UI string — never hard-code text in components
lib/                    utilities, theme, site config
```

## Rules

- Colors only through design tokens (`bg-surface`, `text-accent`, …) defined in `app/globals.css`.
- All UI text goes through `messages/*.json`.
- Secrets live in `.env.local` and Netlify environment variables only.
- Every push to `main` deploys to Netlify.

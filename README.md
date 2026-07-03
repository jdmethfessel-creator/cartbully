# CartBully

A bully that reads your cart. Paste a link. Get a verdict. Save the money.

## Quick start

```bash
cp .env.example .env.local  # optional, app boots with zero env
npm install
npm run dev
```

The app runs with no env set. Verdicts fall back to a deterministic stub, payments hide,
Supabase-backed history is skipped, price-watch cron rejects without CRON_SECRET.

## Environment

| var                                    | purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| NEXT_PUBLIC_APP_URL                    | share links, Stripe redirects                              |
| ANTHROPIC_API_KEY                      | verdict engine (claude-sonnet-4-6)                         |
| NEXT_PUBLIC_SUPABASE_URL / anon key    | client access                                              |
| SUPABASE_SERVICE_ROLE_KEY              | crons, webhooks, cache                                     |
| STRIPE_SECRET_KEY                      | Checkout + Portal                                          |
| STRIPE_WEBHOOK_SECRET                  | webhook signature                                          |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY     | client                                                     |
| STRIPE_PRICE_ID                        | $4.99 weekly recurring price                               |
| RESEND_API_KEY / EMAIL_FROM            | locker drop alerts                                         |
| CRON_SECRET                            | required by /api/cron/price-check                          |
| AMAZON_AFFILIATE_TAG                   | optional; appended to swap search URLs                     |

## Migrations

The schema lives in `scratch/migration.sql`. Paste into the Supabase SQL editor.
Never run against prod without a review.

## Routes

- `/` home + paste field
- `/b/[id]` public beatdown page
- `/b/[id]/opengraph-image` share card
- `/paywall` upgrade flow
- `/account` Stripe portal
- `/locker` price-watched trash
- `/ledger` lunch-money-protected
- `/terms`, `/privacy`
- `/api/verdict` engine
- `/api/rebuttal` one-shot fight back
- `/api/detention` cooldown timer
- `/api/checkout` Stripe session
- `/api/portal` billing portal
- `/api/webhook` Stripe events
- `/api/cron/price-check` daily drop check

## Content factory

```bash
# Put URLs in scripts/products.txt
npx tsx scripts/content-factory.tsx scripts/products.txt
# Outputs to content/YYYY-MM-DD/{slug}-card.png, -story.png, -captions.txt
```

## QA

- `npm run build` and `npm run lint` should both pass with no env set.
- `npx tsx tests/run-verdicts.ts` runs 10 product cases through the engine.
- Simulate the Stripe webhook locally: `stripe listen --forward-to localhost:3000/api/webhook`.
- Hit the cron locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/price-check`.
- Search for em dashes: `git grep -n '—'` should return nothing in source code.

## Deploy

Vercel. Import repo, paste env vars, add the cron from `vercel.json`, point `cartbully.app` at the project.

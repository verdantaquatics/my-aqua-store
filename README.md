# Verdant Aquatics: Online Store

The e-commerce site for **Verdant Aquatics**, an aquarium, aquascaping and live-plant shop based in Khulna, Bangladesh.

Designed and developed by **BigApeWeb**.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) + React 19, TypeScript |
| Styling | Tailwind CSS (theme palettes switchable from the dashboard) |
| Database, auth, storage | Supabase (PostgreSQL, Supabase Auth, Storage bucket `store-assets`) |
| Payments | bKash Tokenized Checkout (merchant) and bKash Personal "Send Money" with manual verification |
| Couriers | Pathao (Aladdin API) and Steadfast, with automatic booking and status sync |
| Email | Resend (invoices, dispatch/cancel notices, daily digest, promo campaigns) |

## Features

- **Storefront**: hero banner; Featured / Trending / Best Seller sliders; category pages (unlimited nesting); product variations with their own price, stock and photo; wishlist; English/Bangla UI; order tracking; printable invoices.
- **Checkout**: COD (optionally with the delivery charge collected upfront), full bKash payment, or bKash Personal. Delivery is charged per zone (inside/outside the store's city), and promo codes are supported. All prices are re-calculated on the server.
- **Customer accounts**: order history, saved address, wishlist, password reset.
- **Dashboard** (`/stradmn`): orders, products, categories, customers and messages, promotions and promo codes, staff with roles, stats, and store settings (branding, payments, couriers, email and tracking pixels).

## Project structure

```
app/                 Routes (storefront pages, /stradmn dashboard, /api route handlers)
components/          UI components (storefront + Admin*Client dashboard screens)
context/             Cart, customer, store-settings and language providers
utils/               Server helpers: auth, pricing, settings, courier, email, inventory
utils/supabase/      Supabase clients (browser, server, middleware)
supabase_*.sql       Database setup and migrations (see below)
```

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key (safe in the browser *only* with the v7 RLS policies applied) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server only. Never expose it. |
| `NEXT_PUBLIC_APP_URL` | yes | Public site URL, used for bKash callbacks and email links |
| `CRON_SECRET` | yes, for crons | Random string. Cron endpoints reject requests without `Authorization: Bearer <CRON_SECRET>`. |
| `BKASH_*`, `PATHAO_*`, `STEADFAST_*`, `RESEND_*` | optional | Fallbacks. Normally these are set from Dashboard > Settings. |

### Database

**New site:** run `supabase_setup.sql` in the Supabase SQL Editor. Set `owner_email` in section 9 first. This one file creates every table, column, security policy and function. Optionally run `supabase_schema.sql` afterwards to load demo categories and products.

**Existing site (Verdant Aquatics):** run `supabase_migrate_v7_security.sql` once. It applies the same security policies and adds the newer settings columns. Running `supabase_setup.sql` again also works; it is safe to re-run.

When you change the database, update `supabase_setup.sql` so it stays the complete template, and add a small `supabase_migrate_vN_*.sql` for sites that already exist. The other `supabase_migrate_*.sql` files are history.

### Dashboard access

1. In Supabase, go to **Authentication > Users > Add user** and create the owner login (tick *Auto Confirm User*).
2. Put that email in section 9 of `supabase_setup.sql` and run it. Alternatively, insert a row into `staff_members` with `role = 'shop_owner'`.
3. Sign in at `/stradmn/login`. Add other staff from **Dashboard > Staff**.

Access is granted **only** by an active `staff_members` row linked to the login. Email patterns and user metadata are never trusted.

Recommended Supabase Auth settings:
- **Disable "Allow new users to sign up"**. Customer accounts are created by the server (`/api/customer/auth`) through the admin API, so public sign-up isn't needed.
- Enable MFA for the owner account.

### Password reset

"Forgot password?" is on the customer sign-in popup and on `/stradmn/login`. The server creates a one-time recovery link and emails it through **Resend** using the store's own sender. The link opens `/auth/confirm`, which signs the user in and forwards to `/reset-password`. Customers then go to `/account`, staff to `/stradmn`.

Setup checklist:
1. In Dashboard > Settings > Email, set the Resend API key and a "from" address on a domain verified in Resend. On the free plan, unverified senders (`onboarding@resend.dev`) can only email your own Resend account address.
2. Set `NEXT_PUBLIC_APP_URL` to the live site URL. The reset link is built from it.
3. Optional fallback (used only when no Resend key is set): in Supabase > Authentication > URL Configuration, set the Site URL and add `https://<your-domain>/auth/confirm` to Redirect URLs. Supabase's built-in mailer only reaches your own team members on the free plan, so also add Resend under Authentication > SMTP Settings (host `smtp.resend.com`, port 465, user `resend`, password = your Resend API key).

### Scheduled jobs

| Endpoint | Purpose |
|---|---|
| `GET /api/cron/courier-sync` | Pulls delivery status from Pathao/Steadfast and marks orders completed or returned |
| `GET /api/cron/daily-digest` | Emails the pending-orders summary at the hour set in Settings (run hourly) |

Both require the `CRON_SECRET` bearer header. Vercel Cron sends it automatically when `CRON_SECRET` is set.

## Stock & order changes

- COD and bKash Personal orders take stock as soon as they are placed. bKash gateway orders take stock once the payment succeeds, so abandoned or failed payments never lock items as out of stock.
- An order that doesn't hold stock yet (e.g. unpaid bKash) takes it when the store accepts or dispatches it. Stock is given back when an order is cancelled, returned or deleted.
- `payment_details.stock_deducted` records whether an order currently holds stock, so stock is never taken twice or given back when it was never taken. The rules live in `utils/order-stock.ts`; use the helpers in `utils/inventory.ts` (`syncOrderStock`, `takeOrderStock`, `releaseOrderStock`) for any new code that changes an order's status.
- Items can be changed on **Pending** and **Confirmed** orders (not after shipping or cancelling). The owner can lower or raise quantities and remove items, optionally put removed units back in stock, adjust the discount, and email the customer the updated order. The invoice updates automatically. Raising a quantity beyond what's in stock shows a warning.

## Performance & caching

- Storefront pages (home, collections, categories, products, about, contact, track) are cached on the CDN and refreshed hourly. Category and product pages are generated on their first visit.
- Every page rebuild counts as an ISR write on Vercel (free plan: 200K/month), so refreshes are kept narrow (`utils/revalidate.ts`):
  - `revalidateStorefront()` refreshes the whole site. Use it only for changes that affect every page: products, categories, promotions, settings.
  - `revalidateStockChanges(db, changes)` is for stock moved by orders (placed, cancelled, returned, edited). It refreshes only the affected product pages, plus the listing pages when a product went in or out of stock. The inventory helpers in `utils/inventory.ts` return the `changes` to pass in.
  - Order changes that don't touch stock (status, dispatch, address, payment) need no refresh.
- Middleware runs only for `/stradmn` (the dashboard gate). Storefront pages never read the session on the server; customer state is loaded in the browser.
- **Vercel function region:** set *Project > Settings > Functions > Function Region* to the region closest to your Supabase project (Supabase > Project Settings > General > Region). For example, Mumbai is `bom1` and Singapore is `sin1`. Every database query from the server crosses that distance.

## Deployment

Deploy to Vercel (or any Node host): set the environment variables, then run `npm run build`. Uploads are compressed in the browser before upload so they stay under hosting request-size limits.

## Security notes

- Order totals, delivery charges and promo discounts are computed on the server (`utils/order-pricing.ts`). bKash callbacks are verified against the order's invoice number and amount.
- Store secrets (bKash, courier, Resend and pixel tokens) never leave the server. The dashboard shows them masked.
- Product descriptions are sanitized (`utils/sanitize.ts`). Customer-supplied text in emails is HTML-escaped.

---

© BigApeWeb. Built for Verdant Aquatics.

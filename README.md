# EVENTRA-NEW

A full-stack event discovery and ticket booking platform for **college/campus events and public events** — concerts, hackathons, workshops, sports, comedy, conferences, and more. Built with Next.js, TypeScript, PostgreSQL/Prisma, NextAuth, and Razorpay (test mode).

> **Read this before you run it.** EVENTRA was generated as a complete source-code project, not deployed or executed anywhere. You need to `npm install` it, connect a real PostgreSQL database, and add your own API keys before it will run. The "Honest limitations" section near the end lists the handful of things that are scaffolded but not fully wired, so you know exactly what to expect.

---

## 1. Overview

EVENTRA lets **attendees** discover and book tickets (general-admission or assigned-seat), get a signed QR digital ticket, and have it scanned at the door. **Organizers** create events through a multi-step wizard, sell tickets, track revenue/attendance, and run the door with a mobile QR scanner. **Admins** moderate public-event submissions and oversee users, events, and transactions.

## 2. Features

### Fully implemented and wired to the database
- Email/password auth (bcrypt-hashed) + Google OAuth via NextAuth, role-based middleware (`ATTENDEE`, `ORGANIZER`, `EVENT_STAFF`, `ADMIN`)
- Event discovery: search, category/audience/format/price filters, sorting, pagination
- Event details page: sticky booking panel, general-admission quantity picker **or** interactive seat map, OpenStreetMap location embed, save/share/add-to-calendar, a real (not simulated) "N people viewing" indicator
- Booking engine with **race-safe overselling prevention** (atomic conditional `UPDATE` under a DB transaction — see `src/lib/bookings/create-booking.ts`), 15-minute inventory holds with an expiry/release job, and the same pattern for seat holds
- Razorpay checkout (test mode): order creation, client-side checkout, **server-side signature verification**, and a webhook handler that is the durable source of truth (idempotent — safe to receive twice)
- Signed, unguessable QR tickets (`src/lib/qr/ticket-token.ts`) and a mobile camera-based scanner (`/scanner`) that verifies + checks in a ticket inside a transaction, so two scanners can never double-check-in the same ticket
- Organizer dashboard with real charts (sales trend, category breakdown), event management (publish/unpublish/cancel), attendee list with CSV export
- Admin dashboard: platform stats, event approval/rejection workflow (public events require approval; college events publish immediately), user suspension, transaction log
- Email notifications (booking confirmation, reminders, cancellation) via Nodemailer — falls back to console logging if no SMTP is configured, so the app still runs end-to-end without an email provider
- Rule-based recommendation engine (no ML dependency — see docstring in `src/lib/recommendations/engine.ts` for exactly how it scores events)
- Event Passport (a stamp per event you actually check into), favorites, waitlist with automatic notification when a cancellation frees up a spot, coupon codes, group-ticket quantity limits, smart tags (🔥 Trending, ⚡ Selling Fast, ✨ New, etc. — all computed from real DB counts, never faked)

### Honest limitations
A few things from the spec are **schema-ready but not fully built into the UI**, so you know exactly what's there:
- **Group booking share links**: `Booking.groupInviteToken` exists in the schema, but there's no invite/join UI yet.
- **"Report event"** submits to a stub endpoint that logs server-side rather than a persisted `Report` table — add one if you need real moderation queueing.
- **Event editing** only covers title/description/banner/cancellation policy. Changing dates, venue, or ticket types after tickets have sold needs more careful handling (refund/reissue flows) than a demo scope covers, so it's intentionally left out — cancel and recreate instead.
- **Push notifications** aren't implemented (in-app `Notification` rows + email are).
- The seat map generates a simple 10-seats-per-row grid from ticket-type capacity; it doesn't support arbitrary venue layouts.

## 3. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui-style components, Framer Motion, Lucide icons |
| Backend | Next.js Route Handlers (API routes), server-side Zod validation |
| Database | PostgreSQL + Prisma ORM |
| Auth | Auth.js (NextAuth) — credentials + Google OAuth |
| Payments | Razorpay (test/sandbox mode) |
| Images | Cloudinary (client-side unsigned upload) |
| QR | `qrcode` (generation) + `jsqr` (in-browser scanning) |
| Email | Nodemailer (SMTP) |

## 4. Project structure

```
src/
  app/                  routes (App Router) — public pages, /dashboard, /organizer, /admin, /scanner, /api/*
  components/
    ui/                 shadcn-style primitives (button, card, dialog, select, ...)
    events/             event card, carousel, filter bar, seat map, ticket selector
    tickets/            digital ticket actions, event passport
    checkout/           Razorpay button, hold-countdown timer
    organizer/          wizard, charts, attendee table, image upload
    admin/               moderation + suspend controls
    scanner/            camera-based QR scanner
    layout/             navbar, footer
  lib/
    auth.ts             NextAuth config
    db.ts               Prisma client singleton
    bookings/           pending-booking creation (overselling prevention), expiry job
    payments/           Razorpay wrapper, shared idempotent confirm-booking logic
    qr/                 signed ticket token generation/verification
    tickets/            ticket generation on payment confirmation
    email/               mailer + HTML templates
    recommendations/    rule-based recommendation engine
    validation/          Zod schemas
prisma/
  schema.prisma         full data model
  seed.ts               demo data
```

## 5. Getting started

### Prerequisites
- Node.js 18.18+
- A PostgreSQL database (local via Docker, or a hosted one — Neon/Supabase/Railway all work)
- A Razorpay account in **test mode** (free) for payments
- Optional: a Google OAuth app, a Cloudinary account, an SMTP provider

### Install

```bash
npm install
cp .env.example .env
```

Fill in `.env` — at minimum `DATABASE_URL`, `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`), and `TICKET_SIGNING_SECRET`. Everything else can stay blank while you explore the UI; payments and Google sign-in just won't work until you add those keys.

### Database

```bash
npm run db:push     # create tables from prisma/schema.prisma
npm run db:seed     # load demo events, users, and bookings
```

(`db:push` is fine for local development; switch to `npm run db:migrate` once you want tracked migrations for a shared/production database.)

### Run

```bash
npm run dev
```

Visit `http://localhost:3000`.

## 6. Demo accounts

All seeded with the password **`Password123!`**:

| Role | Email | Notes |
|---|---|---|
| Attendee | `attendee@eventra.dev` | Has a couple of confirmed bookings already |
| Organizer | `organizer@eventra.dev` | Owns most of the public demo events |
| Organizer | `campus-organizer@eventra.dev` | Owns the college events (auto-published, no approval step) |
| Event staff | `staff@eventra.dev` | Assigned to "Rhythm Beats Fest" — use this to try `/scanner` |
| Admin | `admin@eventra.dev` | Has a pending event ("Midnight Marathon") to approve/reject at `/admin/events` |

## 7. Payments (Razorpay test mode)

1. Sign up at [razorpay.com](https://razorpay.com), switch to **Test Mode**, and copy your Key ID / Key Secret into `.env` (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`).
2. For the webhook (Settings → Webhooks in the Razorpay dashboard), point it at `https://<your-deployed-domain>/api/payments/webhook`, subscribe to `payment.captured`, `payment.failed`, and `refund.processed`, and paste the generated secret into `RAZORPAY_WEBHOOK_SECRET`. Locally, use a tunnel (e.g. `ngrok http 3000`) if you want to test webhooks before deploying.
3. Use [Razorpay's published test card numbers](https://razorpay.com/docs/payments/payments/test-card-upi-details/) at checkout — no real money moves.
4. **Why both a client callback *and* a webhook?** The client callback (`/api/payments/verify`) confirms the booking immediately for a snappy UX, but a closed tab or dropped connection means it might never fire — the webhook is the durable backstop. Both paths call the same idempotent `confirmBookingPayment()` function, so whichever arrives first wins and the second is a no-op.

## 8. How the QR scanner works

1. Every confirmed `Ticket` gets a random 32-byte `secureToken` stored in the database.
2. The QR code encodes `ticketId.secureToken.signature` — a signature computed with HMAC-SHA256 over a server-only secret (`TICKET_SIGNING_SECRET`). This lets the scanner reject obviously tampered codes instantly, but it's never trusted alone.
3. `/scanner` (restricted to `EVENT_STAFF`/`ORGANIZER`/`ADMIN`) opens the device camera, decodes QR codes in-browser with `jsqr`, and calls `POST /api/tickets/verify`.
4. That route re-derives the ticket from the database, checks it belongs to the selected event and hasn't already been used, then flips its status with a **conditional `UPDATE ... WHERE status = 'CONFIRMED'` inside a transaction** — so if two staff members scan the same code in the same instant, only one succeeds and the other correctly sees "already used."
5. On success, an `EventPassportStamp` is recorded for the attendee (the "Event Passport" feature).

## 9. How booking works (and how overselling is prevented)

```
Select ticket(s) or seat(s) → POST /api/bookings (atomic inventory hold, 15-min PENDING booking)
  → checkout page → POST /api/payments/create-order (Razorpay order)
  → Razorpay Checkout → success callback → POST /api/payments/verify (signature check)
      (webhook also fires independently and is idempotent)
  → confirmBookingPayment(): booking → CONFIRMED, tickets generated with signed QR tokens, email sent
```

The overselling guard: booking creation runs `UPDATE "TicketType" SET quantitySold = quantitySold + :qty WHERE id = :id AND quantitySold <= quantityTotal - :qty` inside a transaction. Postgres takes a row lock for that statement, so if two people race for the last ticket, the second request's `WHERE` clause matches zero rows and the whole transaction rolls back with a clear "sold out" error — there's no read-then-write gap for a race condition to slip through. Seat-based events use the identical pattern per seat.

Bookings that don't complete payment within 15 minutes are released back into inventory by `POST /api/bookings/cleanup-expired`, intended to run on a schedule (see `vercel.json`'s `crons` entry, or wire up any external cron pinger).

## 10. How organizers create events

`/organizer/events/new` is an 8-step wizard (basics → date/time → location → banner → ticket types → policies → preview → publish). Ticket mode is chosen per event: **General Admission** (quantity-based) or **Assigned Seating** (generates a seat grid from ticket-type capacity, named-VIP ticket types map to the VIP section). College-audience events publish immediately; public events go to `PENDING_APPROVAL` until an admin approves them at `/admin/events`.

## 11. Security notes

- Passwords are hashed with bcrypt (cost factor 12); never logged or returned by any API response.
- All payment confirmation is server-side — the client Razorpay callback is a UX nicety, not a trust boundary; only a verified HMAC signature (checkout callback) or a verified webhook signature confirms a booking.
- Ticket QR codes never contain personal or payment data, only an opaque ticket id + random token + signature.
- Role checks happen both in `middleware.ts` (route-level) and inside each API route (object-level — e.g. an organizer can only manage their own events).
- `.env` is git-ignored; `.env.example` has placeholders only.

## 12. Deploying

The app is set up for Vercel (Next.js + `vercel.json` cron entries) but runs on any Node host that can reach your Postgres database. Remember to run `npm run db:migrate deploy` (or `db:push` for a quick start) against your production database, and set every variable from `.env.example` in your hosting provider's environment settings.

# Mdawra (مدورة) — Restaurant Ordering Platform

Full-stack, bilingual (EN/AR with RTL) Talabat-style ordering platform for the Kuwaiti restaurant **Mdawra**. Prices are always shown as `KWD 0.000`.

- **Customer site** (`/`) — mobile-first menu with sticky category tabs, picks grid, item rows, customization modal, cart, checkout, and WhatsApp order handoff.
- **WhatsApp ordering bot** — the whole journey inside WhatsApp: language, menu browsing, item
  customization, cart, delivery address, online payment and after-sale feedback.
- **Admin backend** (`/admin`) — dashboard, menu & inventory, orders, media library, banners, feedback, users, settings.
- **API** — Node.js + Express + Prisma + PostgreSQL with JWT role-based auth (`ADMIN`, `STAFF`, `CUSTOMER`).

All menu content, banners, and settings are served live from the API — nothing is hardcoded in the frontend.

## Stack

| Layer    | Tech |
| -------- | ---- |
| Frontend | React 19, Vite, Tailwind CSS, react-router, zustand, i18next, Recharts, axios |
| Backend  | Node.js, Express 5, Prisma ORM, JWT, multer + sharp (uploads/thumbnails), zod validation |
| Database | PostgreSQL |

## Repository layout

```
backend/
  prisma/schema.prisma   Prisma models (User, Category, MenuItem, CustomizationOption,
                         Order, OrderItem, OrderFeedback, Banner, Media, Setting,
                         WhatsappSession, WhatsappMessage, CustomerAddress)
  prisma/seed.js         Seed script: full Mdawra menu + default admin user
  src/routes             Route definitions (thin)
  src/controllers        Request/response + validation
  src/services           Business logic and database access
  src/middleware         auth, error handling, uploads
  src/services/whatsapp  Cloud API client, bilingual copy, conversation state machine
  src/services/payment   Pluggable payment gateway drivers
frontend/
  src/customer           Customer ordering site
  src/admin              Admin panel (layout + pages)
  src/i18n               EN/AR dictionaries
  src/store              cart + auth stores
```

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Backend setup

```bash
cd backend
cp .env.example .env          # then edit DATABASE_URL / JWT_SECRET
npm install
npx prisma migrate deploy     # or: npx prisma migrate dev
npm run db:seed
npm run dev                   # http://localhost:4000
```

Seed credentials (override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`):

```
admin@mdawra.com / Admin@123
```

Seeded menu items use clearly labeled placeholder images; upload real photos from **Admin → Media** and assign them to items.

### Environment variables (backend)

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | API port (default `4000`) |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` / `REFRESH_EXPIRES_IN` | Token lifetimes |
| `UPLOAD_DIR` | Local upload directory (swap the driver in `services/mediaService.js` for S3/Cloudinary) |
| `PUBLIC_URL` | Base URL used to build image URLs |
| `MAX_UPLOAD_BYTES` | Upload size limit (default 5 MB) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Cloud API credentials |
| `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_APP_SECRET` | Webhook verification token and HMAC signing secret |
| `WHATSAPP_SESSION_TTL_MINUTES` | Idle time before a chat's cart/state resets (default 60) |
| `PAYMENT_PROVIDER` | `manual`, `myfatoorah` or `mock` |
| `MYFATOORAH_API_KEY` / `MYFATOORAH_BASE_URL` | MyFatoorah credentials (test host by default) |

## Frontend setup

```bash
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev                   # http://localhost:5173
```

- Customer site: http://localhost:5173/
- Admin panel: http://localhost:5173/admin

```bash
npm run build   # production build
npm run lint    # eslint
```

## API

Public: `GET /api/categories`, `GET /api/items`, `GET /api/banners`, `GET /api/settings`, `POST /api/orders`.
Everything else requires `Authorization: Bearer <token>`; `STAFF` can manage the menu/orders/media/banners, `ADMIN` additionally manages users and deletions.

| Group | Endpoints |
| ----- | --------- |
| Auth | `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me` |
| Categories | `GET /api/categories`, `GET /api/categories/all`, `POST/PUT/DELETE /api/categories[/:id]`, `POST /api/categories/reorder` |
| Items | `GET /api/items`, `GET /api/items/:id`, `POST/PUT/DELETE /api/items[/:id]`, `POST /api/items/reorder`, `POST /api/items/bulk-availability` |
| Orders | `POST /api/orders`, `GET /api/orders` (`?channel=WEB\|WHATSAPP`), `GET /api/orders/:id`, `PATCH /api/orders/:id/status` |
| Feedback | `GET /api/feedback` (staff) |
| WhatsApp | `GET/POST /api/whatsapp/webhook` (Meta Cloud API) |
| Payments | `GET/POST /api/payments/:provider/callback` |
| Banners | `GET /api/banners`, `GET /api/banners/all`, `POST/PUT/DELETE /api/banners[/:id]` |
| Media | `GET /api/media`, `POST /api/media` (multipart `file`), `DELETE /api/media/:id` |
| Users | `GET/POST /api/users`, `GET/PUT/DELETE /api/users/:id` |
| Settings | `GET /api/settings`, `PUT /api/settings` |
| Dashboard | `GET /api/dashboard/stats?range=daily\|weekly\|monthly` |

Order totals are always recalculated server-side from live item prices and selected customization options, so client-side tampering cannot change what is charged. Orders also enforce the configured minimum order value and the open/closed toggle.

## WhatsApp ordering

Orders can be placed end-to-end in a WhatsApp chat — nothing else is needed from the customer:

1. **Language** — first contact asks for English / العربية; every later reply uses that language.
2. **Menu** — categories and items come from the same live menu as the website (interactive lists,
   paginated 8 per page), so **Admin → Menu & inventory** is the single place menus are edited.
3. **Ordering** — quantity prompt, one prompt per customization group, then a cart summary with
   *Checkout / Add more / Clear cart* buttons. Totals are recalculated server-side.
4. **Delivery address** — name, area, block, street, building, extra directions. The address is
   saved per phone number and offered for reuse on the next order.
5. **Payment** — *Pay online* creates a hosted payment link (KNET/card via the configured gateway);
   *Cash on delivery* places the order immediately. The gateway callback is verified against the
   provider before the order is marked `PAID` and confirmed.
6. **After sale** — moving an order to `DELIVERED` in the admin panel sends a 1–5 star request and
   an optional comment; results appear in **Admin → Feedback**.

Status changes (`CONFIRMED`, `PREPARING`, `READY`, `DELIVERED`, `CANCELLED`) are pushed to the
customer's chat automatically. Keywords `menu`, `cart`, `status`, `pay`, `cancel` (and Arabic
equivalents) work at any point.

### Meta setup

1. Create a Meta app with the **WhatsApp** product and a business phone number.
2. Set `WHATSAPP_TOKEN` (permanent system-user token), `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_VERIFY_TOKEN` (any random string) and `WHATSAPP_APP_SECRET`.
3. Point the webhook at `https://<api-host>/api/whatsapp/webhook`, use the same verify token and
   subscribe to the `messages` field.
4. Set `PUBLIC_URL` to the public API base URL — payment links and callbacks are built from it.

Without WhatsApp credentials the bot still runs: outbound messages are logged to the
`WhatsappMessage` table and skipped, which is how the flow is tested locally.

### Payment gateway

`PAYMENT_PROVIDER` selects the driver in `backend/src/services/payment/`:

| Value | Behaviour |
| ----- | --------- |
| `manual` (default) | Online payment button hidden; cash on delivery only |
| `myfatoorah` | KNET/cards via MyFatoorah `SendPayment`; needs `MYFATOORAH_API_KEY` (+ `MYFATOORAH_BASE_URL` for production) |
| `mock` | Dev only — the payment link marks the order paid when opened |

Add a new gateway by dropping a module exposing `name`, `isConfigured`, `createPaymentLink` and
`getPaymentStatus` into that folder and registering it in `payment/index.js`.

## Settings

Managed in **Admin → Settings** and consumed by the customer site: restaurant name (EN/AR), logo, contact, address, working hours, delivery fee, minimum order, service charge / tax percentages, WhatsApp order number, and the site open/closed toggle.

## Deployment notes

- Provide a production `DATABASE_URL`, run `npx prisma migrate deploy`, then `npm start` in `backend/`.
- Build the frontend (`npm run build`) and serve `frontend/dist` from any static host; set `VITE_API_URL` to the deployed API and `CORS_ORIGINS` to the site origin.
- Uploads live on local disk by default; mount a persistent volume or replace the storage driver in `backend/src/services/mediaService.js`.

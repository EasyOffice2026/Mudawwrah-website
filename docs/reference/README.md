# Reference material

Large binaries in this folder are **gitignored** — they bloat the repo and are
shared out of band. Only this README is committed.

## Expected files

| File | What it is |
| --- | --- |
| `talabat-walkthrough.mp4` | Client-supplied screen recording (78.7s, 384×848) of the talabat app ordering from "Zero Carb", used as the UX reference for the customer storefront. |

Ask the client (or whoever ran the last handover) for a copy if it is missing.

## Why the recording matters

The client's brief was "same as it is, all pages" against this recording, plus
three things it does **not** show, which were asked for separately in chat:

- a brand logo animation on entry, then transition into the site
- movement when categories change
- delivery **or** pickup at checkout

Those three are built. What follows is the gap against the recording itself,
from a frame-by-frame pass, as of the storefront redesign.

## Built and matching

Storefront hero and info card (rating, prep window, delivery fee), offer cards,
sticky collapsed header with the category rail, inline category headings,
discount badges with struck-through prices, "Top rated" and "Customizable"
labels, the item sheet's option groups with "Choose up to N" and Optional
badges, the full cart (upsell carousel, cutlery toggle, special request,
voucher field, payment summary with the coupon line, savings bar), delivery
instruction chips, the "Pay with" list, and the closing payment summary.

## Partial

- **Item sheet** — no sticky `× <item name>` bar once the photo scrolls away;
  options have no thumbnail images; extras show a single price where the
  reference shows a discount (`+KWD 0.175` beside a struck `+KWD 0.250`).
- **Address form** — missing the Apartment / House / Office type chips that
  swap fields (Office replaces "Apt. number" with "Company"), the phone field's
  country selector, and the "Additional directions" / "Address label" inputs.
- **Checkout** — missing the saved-address card with map thumbnail and
  "Change", the separate ETA card, the "Use my instructions for this address
  next time" checkbox, and payment-row icons with the PCI footer.

## Not built

1. Promo interstitial modal on landing ("30% OFF", Order now, dismiss).
2. "Start a new cart?" dialog when adding from a different restaurant — the
   cart currently clears silently on switching tenants.
3. Confirm-location screen: full-screen map, draggable pin, "Enter complete
   address".
4. Saved addresses. Addresses are collected per order today.
5. Locked vouchers showing progress ("Add KD 3.725 more to apply") — the app
   only reports the shortfall after the code is tried.

## Blocked on external accounts

- **Google Maps** — the location picker and map thumbnails need a Maps
  JavaScript API key with billing enabled.
- **Apple Pay / KNET** — needs a payment gateway merchant account (MyFatoorah,
  Tap, Checkout.com are the usual Kuwait options). The selection UI exists;
  nothing processes a payment.

## Deliberately not copied

The `Delivered by talabat` line, the `pro` subscription badge, and the talabat
wordmark are that marketplace's own features and trademarks. Each restaurant's
own branding fills those slots instead.

# Telegram Bot Integration — Implementation Report

## Overview

The Telegram bot now consumes shipping data through a single provider,
`TelegramShippingProvider`, instead of querying Supabase ad hoc. The
provider composes a Supabase gateway and a pure calculation engine that
replicates the website's business rules exactly: weight rounding, weight
caps, and USD→SAR currency conversion. No business logic was added to the
backend (Python scrapers / Supabase) or the website (`موقع الشحن`) —
both were left untouched.

## Files Created

- `src/shipping/shipping.types.ts` — `Warehouse`, `Carrier`, `CarrierRate`, `ShippingQuote`.
- `src/shipping/shipping.calculator.ts` — pure calculation engine (`ShippingCalculator`, `nearestAvailableWeight`, `convertToSar`). No Supabase, no Telegram, no Node-specific APIs — safe to reuse from the website, an API service, or a dashboard later.
- `src/shipping/shipping.gateway.ts` — `ShippingGateway`, the only module that queries `warehouses` / `carriers` / `shipping_rates`.
- `src/shipping/telegram-shipping.provider.ts` — `TelegramShippingProvider`, the single entry point the bot uses for shipping data.
- `IMPLEMENTATION_REPORT_TELEGRAM_INTEGRATION.md` — this report.

## Files Modified

- `src/types/shipping.ts` — now re-exports from `src/shipping/shipping.types.ts` instead of declaring its own copies (removes a duplicate type definition).
- `src/services/shipping-pricing.service.ts` — rewritten to delegate every function to `telegramShippingProvider`. Exported function names and signatures (`listWarehouses`, `listCarriers`, `getCarrierRatesSortedByPrice`, `getSelectedCarrierRate`) are unchanged, so every caller (`quote.callbacks.ts`, `shipping.keyboard.ts`, `quote.mapper.ts`, `quote.formatters.ts`) needed no changes.
- `src/lib/shipping.repository.ts` — no longer queries Supabase. Kept in place per instruction as a `@deprecated` compatibility wrapper that delegates to `telegramShippingProvider`, preserving its original exported names/signatures for any code not yet migrated. Nothing in the current codebase imports it anymore (verified by search).

## Architecture

```
handlers/callbacks/quote.callbacks.ts
        │
        ▼
services/shipping-pricing.service.ts   (thin delegator, unchanged public API)
        │
        ▼
shipping/telegram-shipping.provider.ts (TelegramShippingProvider — single entry point)
        │                    │
        ▼                    ▼
shipping/shipping.gateway.ts   shipping/shipping.calculator.ts
   (only Supabase access)         (pure math, framework-agnostic)
```

`lib/shipping.repository.ts` sits outside this chain now — it's a deprecated
leaf that forwards to the provider, not a data-access path anything depends on.

## Bot Flow

Unchanged at the UX level; the data path behind each step now goes through
the provider:

```
User → Choose warehouse → Choose carrier → Enter weight
     → TelegramShippingProvider.getRatesForWeight / getRateForCarrier
     → CarrierRate (price/currency already converted to SAR)
     → Bot response (keyboard / message)
```

`TelegramShippingProvider.calculateQuote()` additionally returns a full
`ShippingQuote` (warehouse, carrier, weight, raw price/currency, SAR
`convertedPrice`, `capped` flag) for future features that need more than a
single carrier line.

## Provider Design

`TelegramShippingProvider` (Dependency Injection: takes a `ShippingGateway`
in its constructor, defaulting to a shared singleton):

- `listWarehouses()` / `listCarriers()` — metadata lookups.
- `getRatesForWeight(warehouseId, weight)` — every carrier's rate at a
  warehouse for a given weight, cheapest SAR price first.
- `getRateForCarrier(warehouseId, carrierId, weight)` — single carrier rate.
- `calculateQuote(warehouse, carrier, weight)` — standardized `ShippingQuote`.

`ShippingGateway` fetches the **full** rate table (every weight tier) for a
pair rather than only rows at-or-above the requested weight. This is what
makes the weight-cap rule possible — the previous ad hoc query (`.gte
("weight", weight)`) could never see the highest tier if it fell below the
requested weight, so it had no way to cap.

## Shared Logic

`shipping.calculator.ts` is a direct TypeScript port of the website's
`CalculatorEngine` + `nearestAvailableWeight` (`موقع الشحن/src/shipping/calculator.js`,
`utils.js`) plus the `USD_TO_SAR = 3.75` conversion constant from
`موقع الشحن/index.html`. It takes no dependency on Supabase, Telegram, or
Node — a plain `RateTable` in, a `CalculatedRate` out. The website's
module could not be imported directly (separate git repo, no build step,
browser-only code using `window.localStorage`), so the algorithm was
ported faithfully rather than shared by reference. If the two projects
are ever unified under one workspace, this file can be lifted out
unchanged into a shared package — see Future Expansion.

## Removed Duplication

- The bot previously had its own Supabase query logic in
  `lib/shipping.repository.ts` running in parallel with the website's
  gateway, with **no weight-cap fallback** and **no currency conversion**
  — two real behavioral divergences from the website. There is now exactly
  one Supabase access point for shipping (`shipping.gateway.ts`), and one
  calculation engine (`shipping.calculator.ts`), both matching the
  website's rules.
- `types/shipping.ts` no longer duplicates interface declarations that now
  live in `shipping/shipping.types.ts`.
- The old `getCarrierRatesSortedByPrice` sorted by raw `price` even when
  carriers were priced in different currencies (a latent bug). It now
  sorts by the converted SAR price, which is also what's displayed.

## Future Expansion

- **Order creation / shipping estimate**: `calculateQuote()` already
  returns the standardized `ShippingQuote` shape requested for this phase;
  an order-creation service can call it directly without touching
  `ShippingGateway` or `ShippingCalculator`.
- **Cross-project sharing**: `shipping.calculator.ts` has zero
  environment dependencies by design. If the website, bot, API, and
  dashboard are ever brought into one workspace (or the website adopts a
  build step), this file can become a published/shared package consumed
  by all four without modification.
- **`capped` in user-facing messages**: the calculator surfaces `capped`
  (weight exceeded every tier) but no UI currently displays it — a
  natural next step if the product wants to warn users explicitly.

## Summary

The bot is now a client of one `TelegramShippingProvider`, backed by one
Supabase gateway and one pure calculator that matches the website's
weight rounding, weight-cap, and currency-conversion rules exactly. No
handler, keyboard, or formatter needed to change. `lib/shipping.repository.ts`
remains as a deprecated, non-Supabase-touching compatibility shim rather
than being deleted. `npx tsc --noEmit` passes clean under the project's
strict compiler settings.

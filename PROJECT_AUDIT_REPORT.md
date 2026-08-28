# Project Audit Report — Shipping Pricing Integration

**Date:** 2026-07-17
**Scope:** Remove hardcoded shipping prices/companies and connect the bot to real Supabase data (`warehouses`, `carriers`, `shipping_rates`).

---

## 1. Findings Before Implementation

### 1.1 Hardcoded shipping data
- `src/keyboards/shipping.keyboard.ts` had a static 4-button list (MyUS, FedEx, DHL, Shop&Ship) with no real prices behind it.
- `src/handlers/callbacks/quote.callbacks.ts` mapped those 4 fixed callback actions to plain company-name strings — no price was ever computed or stored.
- `VIEW_ALL_PRICES` was a placeholder (`"سيتم عرض جميع الأسعار في وقت لاحق..."`) with no real data.
- No concept of "warehouse" existed anywhere in the session/draft state or UI flow, even though price lookup requires one.

### 1.2 Infrastructure bug found
- `.env` → `SUPABASE_URL` was set to `https://<project>.supabase.co/rest/v1/`. `@supabase/supabase-js`'s `createClient()` appends `/rest/v1` itself, so every query would have hit a doubled, broken path (`/rest/v1//rest/v1/...`). **Fixed** to the bare `https://avmlfadkiyyqbwwkfpkb.supabase.co`.
- `src/lib/supabase.ts` read credentials directly from `process.env` instead of the project's centralized `src/config/env.ts`, breaking the established config pattern. **Fixed.**

### 1.3 Supabase permissions
- The `service_role` key initially got `42501: permission denied` on `warehouses`, `carriers`, and `shipping_rates` — no `GRANT SELECT` existed for that role on these tables. Resolved after the user ran the appropriate `GRANT SELECT ... TO service_role;` statements.
- `countries` table is still not granted to `service_role` (not required for this task, but noted for future work — see §5).

### 1.4 Real schema discovered (via PostgREST OpenAPI introspection)
| Table | Columns |
|---|---|
| `warehouses` | `id, country_id, name, created_at` |
| `carriers` | `id, name, created_at` |
| `shipping_rates` | `id, warehouse_id (FK→warehouses.id), carrier_id (FK→carriers.id), weight, price, currency (default SAR), delivery_days, source_file, imported_at` |

- **`shipping_rates` currently has 0 rows** — price lookups will correctly return "no data available" until real rate data is imported.
- Warehouse names collide across countries (e.g. `MyUS` exists for `country_id` 2 and 4; `Shop & Ship` for 2, 3, and 4). Disambiguated in the UI by appending the row id, e.g. `MyUS (#7)`.

---

## 2. Design Decisions

- **Direct vs. indirect split**: only the *indirect* shipping method has a weight (`indirectWeight`), so only that path performs a real DB price lookup (warehouse → carrier → weight → price). The *direct* method keeps its manually-entered cost (no weight exists to price against) but now lists real carrier names from the `carriers` table instead of a hardcoded list.
- **Rate-tier logic**: `shipping_rates.weight` is treated as a tier ceiling. For a given warehouse + weight, the cheapest qualifying tier per carrier (`weight >= requested weight`, smallest such `weight`) is selected, then carriers are sorted by price ascending.
- **Scope boundary respected**: the bot only *reads and displays* stored rates — it does not compute totals, margins, or taxes. Those remain the website's responsibility, per this project's business rule.

---

## 3. Files Changed

**New:**
- `src/types/shipping.ts` — `Warehouse`, `Carrier`, `CarrierRate` types
- `src/lib/shipping.repository.ts` — raw Supabase queries (typed, no `any`)
- `src/services/shipping-pricing.service.ts` — sorts/shapes rate data (no Telegram code)

**Modified:**
- `.env` — fixed `SUPABASE_URL`
- `src/config/env.ts` — added `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `src/lib/supabase.ts` — now reads from `config/env.ts`
- `src/types/quote.ts` — added `warehouseId/warehouseName/shippingPrice/shippingCurrency` to `Draft`; added `"select_warehouse"` step
- `src/types/quote-api.ts` — added `warehouse/price/currency` to `QuotePayload.shipping`
- `src/session/session.ts` — initialized new fields
- `src/services/quote.service.ts` — new `selectWarehouse()`; `submitIndirectShippingWeight()` now routes to `select_warehouse`; `setShippingCompany()` extended to carry price/currency
- `src/services/quote.mapper.ts` — passes real warehouse/price/currency to the API payload
- `src/keyboards/shipping.keyboard.ts` — static `shippingCompanyKeyboard` replaced with dynamic `warehouseKeyboard()`, `priceCarrierKeyboard()`, `plainCarrierKeyboard()`
- `src/constants/callback.actions.ts` — removed the 4 hardcoded company constants; added `SELECT_WAREHOUSE_PREFIX`, `SELECT_CARRIER_PREFIX`, `BACK_TO_WAREHOUSE`
- `src/handlers/callbacks/quote.callbacks.ts` — wired the new warehouse step, prefix-based dynamic callback routing, real `VIEW_ALL_PRICES`
- `src/handlers/message.handler.ts` — direct/indirect flows now fetch real carriers/warehouses after text input
- `src/formatters/quote.formatters.ts` — added warehouse-selection prompt text, real price shown in quote summary and customer-quote text, new `formatAllPricesText()`

No files were renamed, no unrelated files were touched, and all existing screens/wording were preserved.

---

## 4. Verification

- `npx tsc --noEmit -p tsconfig.json` → **0 errors** (confirmed via `--listFiles` that all 29 project source files, including the new shipping files, were compiled).
- Repo-wide search confirmed no remaining hardcoded carrier names/prices (`MyUS|FedEx|DHL|Shop&Ship`) anywhere in `src`.

---

## 5. Known Follow-ups (not in scope for this task)

- `shipping_rates` has no data yet — price lookups and `VIEW_ALL_PRICES` will show "no data available" messages until rates are imported.
- `countries` table is not yet granted to `service_role`; if warehouse labels should show country names instead of id-disambiguation, that grant + a small join would be needed.
- This was not tested against a live Telegram chat in this session (no running bot instance was started) — recommended before shipping to production.

# System Architecture Report

**Scope:** the entire shipping/quoting system as it exists on disk on 2026-07-24.
**Method:** every source file in the three code bases was read. Nothing in this document is inferred from documentation, file names, or assumption unless explicitly labelled **UNCLEAR** or **NOT FOUND**.

**Code bases covered**

| Path | Role | Language |
|---|---|---|
| `Desktop/scraper/موقع الشحن` | The website — UI, pricing engine, shipping engine, orders, quotes | Vanilla HTML/CSS/JS (ES modules) |
| `Desktop/scraper/telegram-bot` | The Telegram bot | Node.js + TypeScript + grammY |
| `Desktop/scraper/اسعار الشحن المحدثة` | Shipping-rate scraper pipeline (writes the rate tables) | Python + Playwright |

All three point at the **same Supabase project**: `https://avmlfadkiyyqbwwkfpkb.supabase.co`.

---

## 1. Overall Architecture

### 1.1 The honest picture

There is **no application backend**. There is no Express/Nest/Fastify server, no Supabase Edge Function, and no Postgres RPC function anywhere in any of the three code bases (verified by grepping for `.rpc(`, `functions.invoke`, `/functions/v1` — zero hits). The "backend" is Supabase's PostgREST endpoint, called directly from the browser with the anon/publishable key, and directly from the bot with the service-role key.

Consequently the diagram requested in the prompt collapses one layer:

```
                              ┌──────────────────────────────┐
                              │           USER               │
                              └───────────────┬──────────────┘
                    ┌─────────────────────────┴────────────────────────┐
                    ▼                                                  ▼
   ┌────────────────────────────────┐              ┌────────────────────────────────┐
   │  FRONTEND (موقع الشحن)          │              │  TELEGRAM CLIENT               │
   │  index.html — one page,         │              │  grammY bot (telegram-bot)     │
   │  two tabs (Calculator / Orders) │              │  inline keyboards + text steps │
   └───────────────┬────────────────┘              └───────────────┬────────────────┘
                   │                                               │
                   ▼                                               ▼
   ┌────────────────────────────────┐              ┌────────────────────────────────┐
   │  BUSINESS LOGIC (in-page)      │              │  BUSINESS LOGIC (bot-local)    │
   │  · PRICING ENGINE               │              │  · quote.service.ts (state m/c) │
   │    currentCalcs / getProduct-   │              │  · TelegramShippingProvider     │
   │    Summary / calcTax            │              │  · ShippingCalculator           │
   │  · RESTRICTION ENGINE           │              │  ✗ no pricing engine            │
   │    SHIPPING_RESTRICTION_RULES   │              │  ✗ no restrictions              │
   │  · SHIPPING ENGINE              │              │  ✗ no commission / tax / fees   │
   │    src/shipping/ ShippingProvider│             │  ✗ no discount                  │
   └───────────────┬────────────────┘              └───────────────┬────────────────┘
                   │                                               │
                   │  supabase-js v2 (anon key,                    │  supabase-js v2
                   │  loaded from jsDelivr CDN)                    │  (SERVICE ROLE key)
                   ▼                                               ▼
   ┌───────────────────────────────────────────────────────────────────────────────┐
   │                     SUPABASE  (PostgREST auto-generated REST)                 │
   │  no Edge Functions · no RPC · no custom endpoints · table access only         │
   └───────────────────────────────────┬───────────────────────────────────────────┘
                                       ▼
   ┌───────────────────────────────────────────────────────────────────────────────┐
   │                            POSTGRES DATABASE                                  │
   │  warehouses · carriers · shipping_rates · product_weights · orders            │
   │  import_batches · countries                                                   │
   └───────────────────────────────────▲───────────────────────────────────────────┘
                                       │  service_role key, upsert
                       ┌───────────────┴────────────────┐
                       │  PYTHON SCRAPER PIPELINE       │
                       │  (اسعار الشحن المحدثة)          │
                       │  Scraper→Normalizer→Validator  │
                       │  →ShippingRepository           │
                       └───────────────▲────────────────┘
                                       │  Playwright
                       ┌───────────────┴────────────────┐
                       │  EXTERNAL: myus.com,           │
                       │  shopandship.com               │
                       └────────────────────────────────┘
```

### 1.2 Layer-by-layer

**Frontend.** `index.html` is 7,860 lines: lines 8–4157 are CSS, 4159–4570 are the HTML body, 4572–7649 are the main classic `<script>`, 7651–7839 is the Supabase client + data layer, 7841–7857 is an ES-module block. There is no framework, no build step, no bundler, no React. Rendering is string-concatenated HTML assigned to `innerHTML`, and events are wired with inline `onclick=` attributes plus a set of `window.*` assignments (index.html:7619–7647) that expose handlers to those attributes.

**Business logic.** Lives inside the same `<script>` as the rendering code, in plain functions operating on a single module-scoped `state` object. The one part that was extracted is the shipping data layer (`src/shipping/`, 6 ES modules).

**Database.** Postgres via Supabase. Both the website and the bot read `warehouses`, `carriers` and `shipping_rates`. The website additionally owns `orders` and `product_weights`. The Python pipeline is the only writer of `shipping_rates` and `import_batches`.

**Supabase.** Used purely as a hosted Postgres + PostgREST. Grants are explicit and minimal:
- `sql/006_grant_anon_read_access.sql` (website project) — `grant select` to `anon` on `warehouses`, `carriers`, `shipping_rates`. Read-only by design; the comment states the website never writes shipping data.
- `sql/007_create_product_weights.sql` — `grant select, insert, update, delete` to `anon` on `product_weights`.
- `sql/000_grant_service_role_privileges.sql` (scraper project) — `grant select, insert, update, delete` to `service_role` on `shipping_rates` + sequence usage.

**Shipping Engine.** Two independent implementations of the same rules (details in §3).

**Pricing Engine.** Exists **only** in the website (details in §4). The bot does not price anything.

**Telegram Bot.** Present and running-capable (`npm run dev` → `tsx src/app.ts`). It collects product and shipping data and can look up shipping rates, but it does not compute a total. Its customer message says, literally, "سيتم احتسابها من قبل الموقع" (will be calculated by the website) for commission, tax and final total.

**External APIs.**
- `cdn.jsdelivr.net/npm/xlsx@0.18.5` — SheetJS, loaded in a blocking `<script>` (index.html:4571). Used for saved-weight Excel export/import and the emergency rate importer.
- `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` (index.html:7651).
- `wa.me/?text=…` — WhatsApp deep link with **no phone number**, deliberate (comment at index.html:7526–7528).
- `zatca.gov.sa/…/Calculator.aspx` — a URL string pasted into the WhatsApp message; never called programmatically.
- `api.telegram.org` via grammY long-polling (`bot.start()`).
- `axios.post(${API_BASE_URL}/quotes)` from the bot — **the target does not exist in any of these code bases** (see §16 / §18 open items).

### 1.3 Data flow, end to end

1. Python scrapers open MyUS / Shop&Ship with Playwright → `RawScrapedRate` → per-provider Normalizer maps native labels to immutable **codes** → `RateValidator` applies range rules → `ShippingRepository.save_many_rates()` upserts into `shipping_rates` on conflict key `(warehouse_id, carrier_id, weight)`, tagged with an `import_batch_id`.
2. Browser loads `index.html`. The module block constructs `new ShippingProvider(window.db)` and calls `window.initApp()`, which runs `loadOrders()`, `loadSavedWeights()` and `ShippingProvider.boot(SHIPPING_PAIRS_TO_PRELOAD)` in parallel, then `render()`.
3. `ShippingProvider.boot()` fetches every `(warehouse, carrier)` rate table into an in-memory `Map`, and mirrors each one into `localStorage` as the offline cache.
4. The user fills product fields → every keystroke calls `updateProduct()` → `saveState()` (localStorage) → `render()` → `renderSummary()` → `currentCalcs()` → totals + `whatsappMessage()` + `autosaveCurrentQuote()`.
5. Quote → Order conversion writes a row to `orders` (whole order object stored in a single `payload` JSON column).

---

## 2. Project Structure

### 2.1 `موقع الشحن` (the website)

```
موقع الشحن/
├── index.html                 ← THE application (7,860 lines)
├── package.json               ← name/version only; NO dependencies, NO scripts
├── src/shipping/              ← the only extracted module layer
│   ├── index.js               ← public surface: re-exports ShippingProvider ONLY
│   ├── provider.js            ← ShippingProvider — composition root of the layer
│   ├── repository.js          ← ShippingGateway — the only Supabase caller here
│   ├── calculator.js          ← CalculatorEngine — pure tier lookup
│   ├── cache.js               ← OfflineCache — localStorage last-known-good
│   ├── service.js             ← ShippingHealthService — boot/retry state machine
│   ├── utils.js               ← cacheKey / nearestAvailableWeight / withRetry
│   ├── constants.js           ← table names, retry config, feature flags, dev mode
│   └── types.js               ← JSDoc typedefs only, no runtime code
├── legacy/excel_import.js     ← DEPRECATED Excel/CSV/JSON rate importer
└── sql/
    ├── 006_grant_anon_read_access.sql
    └── 007_create_product_weights.sql
```

**Entry point:** `index.html`. Loaded directly by a browser (`file://` or any static host). Boot order is deliberate and documented in comments at index.html:7833–7836: the classic script defines `initApp` but does **not** call it; the trailing `<script type="module">` (index.html:7841) imports `ShippingProvider`, assigns `window.ShippingProvider`, and only then calls `window.initApp()`.

**`src/shipping/` responsibilities and dependency direction** (enforced by comment contract, not by tooling):

| File | Purpose | Depends on |
|---|---|---|
| `index.js` | Public API barrel — exports `ShippingProvider` and nothing else | `provider.js` |
| `provider.js` | Composes gateway + cache + calculator + health; owns the in-memory rate-table cache; exposes `boot/retry/getRate/isReady/health/feature-flags/importEmergencyTable` | all others |
| `repository.js` | `ShippingGateway`: `fetchWarehousesAndCarriers()` (`select id, code, name`), `fetchRates(warehouseId, carrierId)` (`select weight, price, currency, delivery_days`). No caching, no retry, no fallback — by design | `constants.js`, supabase client |
| `calculator.js` | `CalculatorEngine.getRate(table, weightLb)` — pure. No network, no DOM | `utils.js` |
| `cache.js` | `OfflineCache` — durable per-pair rate tables under key `shipping_offline_cache_v1`, each entry `{table, savedAt}` | `constants.js` |
| `service.js` | `ShippingHealthService.run(liveFetch, offlineFallback)` — LOADING → (RETRYING)* → READY \| OFFLINE \| FAILED. Never throws | `constants.js`, `utils.js` |
| `constants.js` | `TABLES`, `HEALTH_STATE`, `RETRY_CONFIG {MAX_ATTEMPTS:3, BASE_DELAY_MS:1000}`, `OFFLINE_CACHE_STORAGE_KEY`, `FEATURE_FLAG_DEFAULTS`, dev-mode helpers | `window.localStorage`, `window.location` |

`legacy/excel_import.js` is loaded **only** via a dynamic `import()` inside `runEmergencyImport()` (index.html:7400–7414), which is only reachable when Developer Mode **and** the `EMERGENCY_IMPORT` flag are both on. Normal users never fetch the file.

### 2.2 `telegram-bot`

```
telegram-bot/src/
├── app.ts                     ← ENTRY POINT (npm run dev → tsx src/app.ts)
├── config/env.ts              ← BOT_TOKEN, OWNER_ID, API_BASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
├── lib/
│   ├── supabase.ts            ← createClient(url, SERVICE_ROLE key)
│   └── shipping.repository.ts ← @deprecated thin wrapper over the provider
├── telegram/
│   ├── bot.ts                 ← Bot instance + session middleware
│   └── router.ts              ← EMPTY FILE (0 bytes)
├── session/session.ts         ← SessionData shape + initialSession()
├── types/                     ← quote.ts, quote-api.ts, shipping.ts (re-export)
├── constants/
│   ├── callback.actions.ts    ← legacy flow callbacks (50 constants)
│   └── callbacks.ts           ← Dashboard callbacks (namespaced, payload-carrying)
├── keyboards/                 ← main, back, quote, product, shipping
├── handlers/
│   ├── start.handler.ts       ← /start
│   ├── dashboard.handler.ts   ← /dashboard (temporary mount, sends a fresh reply)
│   ├── callback.handler.ts    ← dispatch: quote callbacks → common callbacks
│   ├── message.handler.ts     ← text input, dispatched on session.draft.currentStep
│   └── callbacks/
│       ├── quote.callbacks.ts ← 516 lines, the legacy flow
│       └── common.callbacks.ts← cancel / orders / settings / home
├── services/
│   ├── quote.service.ts       ← pure session state machine (371 lines)
│   ├── quote.mapper.ts        ← Draft → QuotePayload
│   ├── quote.api.service.ts   ← guard + map + POST
│   └── shipping-pricing.service.ts ← 4 pass-through wrappers over the provider
├── shipping/
│   ├── shipping.gateway.ts    ← ONLY Supabase caller for shipping
│   ├── shipping.calculator.ts ← pure, TS port of the website's CalculatorEngine
│   ├── telegram-shipping.provider.ts ← composition root
│   └── shipping.types.ts
├── formatters/quote.formatters.ts ← all user-facing text
├── dashboard/dashboard.ts     ← renderDashboard(session) → {text, keyboard}, pure
├── api/quote.client.ts        ← axios POST {API_BASE_URL}/quotes
└── utils/                     ← html.ts (escapeHtml), url.ts (validateUrl)
```

**Entry point:** `src/app.ts`. Registers `/start`, `/dashboard`, `callback_query:data`, `message:text`, then `bot.start()` (long polling).

**Two parallel, non-connected UI generations exist in this repo:**
- The **legacy flow**: `callback.actions.ts` + `quote.callbacks.ts` + `message.handler.ts`. Fully wired and functional.
- The **Dashboard**: `dashboard/dashboard.ts` + `constants/callbacks.ts`, reachable only via `/dashboard`. **Its buttons are dead.** `callbackHandler` routes to `handleQuoteCallback` (which only knows `CALLBACK_ACTIONS.*`) and then `handleCommonCallback` (same). No handler anywhere matches `p:add`, `p:edit:`, `p:del:`, `p:manage`, `sh:m:direct`, `sh:m:indirect`, `sh:wh`, `sh:w`, `q:cancel`, or `nav:home` (`nav:home` in particular is distinct from the legacy `"home"` string that `back.keyboard.ts` uses). Pressing any Dashboard button produces only an `answerCallbackQuery` and no state change. The file header calls this "Commit 1 scope", so this is work in progress, not a regression.

### 2.3 `اسعار الشحن المحدثة` (the scraper)

**Entry point:** `main.py` (`python main.py [myus] [shopandship]`).

Pipeline stages, one shape per stage (`models.py`): Scraper → `RawScrapedRate` → Normalizer → `NormalizedRate` → Validator (filters only) → `ShippingRepository` (persists). Key architectural rule stated in `shipping_repository.py`: the repository resolves **codes** to database ids and never references a provider name, carrier name, or scraper class.

---

## 3. Shipping Engine

There are **two** shipping engines. They implement the same lookup semantics but resolve carriers by different keys and expose different capabilities.

### 3.1 Website shipping engine

**Carrier catalogue** — a hard-coded array, index.html:4807–4814. This is the only place a carrier is defined on the website:

| `id` | `label` | `time` | `source` | `warehouseCode` | `carrierCode` |
|---|---|---|---|---|---|
| `budget` | MyUS Budget | 8 - 14 يوم | myus | MYUS_US | BUDGET |
| `aramex` | MyUS Aramex | 3 - 5 أيام | myus | MYUS_US | ARAMEX |
| `fedex` | MyUS FedEx | 3 - 6 أيام | myus | MYUS_US | FEDEX_PRIORITY |
| `fedex_economy` | MyUS FedEx Economy | *(empty)* | myus | MYUS_US | FEDEX_ECONOMY |
| `dhl` | MyUS DHL | 2 - 5 أيام | myus | MYUS_US | DHL |
| `shopship` | Shop & Ship | 4 - 7 أيام | shopship | SHOPANDSHIP_US | SHOPANDSHIP_MEMBER |

Note: `id: 'fedex'` maps to `FEDEX_PRIORITY`. The comment at index.html:4802–4806 records that "fedex" has always meant FedEx Priority on this site.

**Warehouse selection.** There is none at runtime. Every carrier is statically bound to a warehouse code, and only two warehouses are reachable (`MYUS_US`, `SHOPANDSHIP_US`) even though the DB has five coded warehouses (`MYUS_UK`, `SHOPANDSHIP_SG`, `SHOPANDSHIP_UK` are never used by the website).

**`ShippingProvider.boot(pairs)` execution flow:**

```
boot(pairs)                                          pairs = CARRIERS.map(c => [c.warehouseCode, c.carrierCode])
 └─ ShippingHealthService.run(liveFetch, offlineFallback)
     ├─ state = LOADING
     ├─ withRetry(liveFetch, maxAttempts=3, baseDelayMs=1000)      ← linear backoff: 1s, 2s
     │   └─ _loadAllLive(pairs)
     │       ├─ if !getFeatureFlag('SUPABASE_SHIPPING') → throw
     │       ├─ _ensureMetadataLoaded()   → fetchWarehousesAndCarriers(), build code→row Maps
     │       └─ Promise.all(_loadOneLive(wh, ca)) for every pair
     │            ├─ resolve codes → ids  (throws on unknown combination)
     │            ├─ gateway.fetchRates(warehouseId, carrierId)
     │            ├─ build table  { [weight]: {price, currency, deliveryDays} }
     │            ├─ _rateTableCache.set(key, table)      ← in-memory, per page session
     │            └─ cache.save(key, table)               ← localStorage, durable
     │       (on any attempt failure, attempt < 3 → state = RETRYING)
     ├─ success → state = READY
     └─ all retries exhausted
         └─ _loadAllFromOfflineCache(pairs)
             ├─ if !getFeatureFlag('OFFLINE_CACHE') → false
             └─ for each pair: load from localStorage into _rateTableCache
         ├─ recovered anything → state = OFFLINE
         └─ nothing recovered → state = FAILED   (Emergency Import is the last resort)
```

`cacheKey(warehouseCode, carrierCode)` = `` `${warehouseCode}::${carrierCode}` `` (utils.js:12).

**`lookupShipping(weight, unit, carrierId)`** — index.html:4984–5002. The single boundary between product code and the shipping layer:

1. `lbExact = getWeightLb(weight, unit)` — kg → lb via `KG_TO_LB = 2.20462`.
2. `lbExact <= 0` → zero result.
3. Find the carrier in `CARRIERS` by `id`; unknown → zero result.
4. `ShippingProvider.getRate(carrier.warehouseCode, carrier.carrierCode, lbExact)`.
5. `null` rate → zero result.
6. **Currency conversion:** if `rate.currency === 'USD'`, `priceSar = rate.price * 3.75`; otherwise the stored price is treated as already-SAR.
7. Returns `{price (SAR), lb, capped, priceUsd, deliveryDays}` where `priceUsd` is `rate.price` only when the source currency was USD, else `0`.

**Weight-tier lookup** — `CalculatorEngine.getRate` + `nearestAvailableWeight`:
- `weightLb <= 0` → `null`.
- `lb = Math.ceil(weightLb)` — always rounded **up** to a whole pound.
- Sort the table's numeric weight keys ascending.
- Choose the smallest key `>= lb`; if none exists, choose the **highest** key and set `capped: true`.
- Empty table → `null`.

**Delivery days.** `rate.deliveryDays` comes from `shipping_rates.delivery_days`; when that is empty, `lookupShipping` falls back to the static `carrier.time` string from the `CARRIERS` array.

**Readiness gates.** `isMyusUploaded()` / `isShopshipUploaded()` (index.html:4967–4973) keep their historical names but now mean "the provider has a non-empty cached table for at least one carrier of that source". `areAllFilesUploaded()` requires only MyUS in combined mode, both otherwise.

**Health UI.** `SHIPPING_HEALTH_LABELS` (index.html:7368) maps the five states to Arabic strings shown in the settings modal; `retryLoadShippingRates()` (index.html:7814) re-runs `boot`.

### 3.2 Bot shipping engine

Same tier/cap/`Math.ceil` semantics and the same `USD_TO_SAR = 3.75`, re-implemented in TypeScript (`shipping.calculator.ts`). Differences that matter:

| Aspect | Website | Bot |
|---|---|---|
| Carrier/warehouse key | immutable `code` strings | numeric database `id` |
| Carrier catalogue | hard-coded `CARRIERS` array | fetched live from `carriers` / `warehouses` |
| Warehouse choice | none (static per carrier) | user picks from `warehouseKeyboard(warehouses)` |
| Caching | in-memory + localStorage offline cache | **none** — every screen re-queries Supabase |
| Retry / health states | 3 attempts + OFFLINE/FAILED states | none; `try/catch` → "try again later" message |
| Restrictions | full rule engine | none |
| Discount | yes | none |
| Supabase key | `anon` (read-only grants) | `service_role` (full privileges) |

`TelegramShippingProvider.getRatesForWeight()` returns rows whose `price` is **already converted to SAR** and whose `currency` field is the literal string `"SAR"`, sorted ascending by price. `calculateQuote()` returns the richer `ShippingQuote` (raw `price`+`currency` *and* `convertedPrice`, plus `capped`) but **is never called by any handler** — it is currently dead code prepared for future use.

### 3.3 Shipping restrictions

Restrictions are a **website-only** engine (§7). They are not part of `src/shipping/` and are not known to the bot.

---

## 4. Pricing Engine

Everything below is website-only, in `index.html`. Order of operations is exactly as written.

### 4.1 Constants (index.html:4578–4595)

```js
MAX_LB                 = 50        // DECLARED BUT NEVER USED anywhere — dead constant
KG_TO_LB               = 2.20462
USD_TO_SAR             = 3.75
COMMISSION_THRESHOLD   = 2000
LOW_COMMISSION         = 50
HIGH_COMMISSION        = 100
CUSTOMS_DUTY_RATE      = 0.05
CUSTOMS_SERVICE_RATE   = 0.0015
CUSTOMS_SERVICE_MIN    = 15
CUSTOMS_SERVICE_MAX    = 500
VAT_RATE               = 0.15
EXTRA_FEE_DEFAULTS     = { dangerousGoodsMinSar: 112, installedLithiumBatterySar: 30, specialPackagingSar: 90 }
DISCOUNT_OPTIONS       = [0, 10, 15, 20, 25]
DEFAULT_CARRIER_DISCOUNT = 15
```

Currency table (index.html:4816–4824) with default SAR rates: USD 3.75, EUR 4.05, GBP 4.75, AUD 2.45, CAD 2.70, SGD 2.80, OTHER 1.00. Selecting a currency overwrites the product's `exchangeRate` with the default (index.html:4:5606–5613); the rate remains user-editable afterwards.

### 4.2 Product subtotal

`productPriceSar(p, index)` — index.html:5020–5025:

```
quantity = max(1, p.quantity)
rate     = (isSingleSiteOrder() && index > 0) ? products[0].exchangeRate : p.exchangeRate
result   = p.price × rate × quantity
```

In a **single-site** order, every product after the first is forced to use the first product's exchange rate. `updateProduct` also propagates the first product's `currency`/`exchangeRate` down to the rest on change (index.html:5615–5620).

### 4.3 Local shipping

`productLocalShippingSar(p)` = `p.localShippingCost × p.exchangeRate`. Applies only when `shippingType === 'indirect'` (i.e. shipping to the US mailbox first). It is added into the shipping bucket, not the product bucket.

### 4.4 International shipping

Two shapes, selected by `p.shippingType`:

- **`'direct'`** — the seller ships internationally. `shippingRsar = p.directShippingCost × p.directShippingRate`. No carrier, no weight, no restriction fee, no manual additional fee (index.html:5238 excludes direct from manual fees; index.html:5594–5599 clears them when the user picks direct).
- **`'indirect'`** — via the US mailbox. `shippingRsar = localShipping + selectedCarrier.discountedPrice`. The carrier is resolved by `getProductSummary` (index.html:5214–5236):
  1. `optionsAll = sortedPricedCarrierOptionsForProduct(p, index, includeBlocked=true)`
  2. `options = optionsAll.filter(o => !o.blocked)`
  3. `selected = optionsAll.find(o => o.id === p.carrierId) || options[0] || null`
     — a manually chosen **restricted** carrier still wins; the automatic fallback only ever picks a non-restricted one.
  4. If a selection exists, `p.carrierId` is written back (a mutation inside a "calculation" function), `shippingRsar += selected.discountedPrice`, and `automaticExtraFeeAmount = selected.assessment.feeAmount`.

Note the split: `discountedPrice` (discount applied, restriction fee **excluded**) goes to shipping; the restriction fee goes to fees.

### 4.5 Additional fees

`additionalFeeAmount = manualAdditionalFeeSar(p) + automaticExtraFeeAmount`, where the manual part is zero for `direct`. See §6.

### 4.6 The aggregate — `currentCalcs()` (index.html:5244–5289)

Three mutually exclusive branches:

**A. MyUS Combined mode** (`isMultiSiteOrder() && orderShippingMode === 'myusCombined' && products.length > 1`):
```
for each product:
    totalPrice         += productPriceSar(p, i)
    totalLocalShipping += productLocalShippingSar(p)
    totalFees          += manualAdditionalFeeSar(p)
    combinedWeightLb   += productEnteredWeightLb(p)
combinedMyusShipping = getCombinedMyusShipping(combinedWeightLb)
totalShipping = totalLocalShipping + (combinedMyusShipping.shippingOnly ?? combinedMyusShipping.price ?? 0)
totalFees    += combinedMyusShipping.extraFeeAmount
```
`getCombinedMyusShipping` (index.html:5164–5190) prices the **summed** weight against MyUS carriers only, filters to DHL/FedEx/FedEx-Economy when any restriction fee applies, applies the discount, adds the summed restriction fee, and picks the cheapest by `finalPrice` with `originalIndex` as tie-break. If any product is blocked for MyUS, it returns `{blocked: true, reason}` and zero price.

**B. Single-site order:** product `[0]` contributes price + shipping + fees via `getProductSummary`; every other product contributes **price only**.

**C. Multi-site independent (default):** every product contributes price + shipping + fees via `getProductSummary`.

Then, uniformly:

```
subtotal   = totalPrice + totalShipping + totalFees
threshold  = state.commissionConfig.threshold      ?? 2000
lowComm    = state.commissionConfig.lowCommission  ?? 50
highComm   = state.commissionConfig.highCommission ?? 100
commission = subtotal < threshold ? lowComm : highComm
total      = subtotal + commission
tax        = calcTax(totalPrice)                    ← NOTE: totalPrice only
```

### 4.7 Commission

A flat two-tier amount, **not** a percentage: below the threshold it is `lowCommission`, at/above it is `highCommission`. Configurable in the settings modal and persisted in `state.commissionConfig`.

### 4.8 Tax — `calcTax(amount)` (index.html:5192–5199)

Called with `totalPrice` (goods value only — shipping, fees and commission are excluded from the tax base):

```
if amount <= 0 → 0
duty        = amount × 0.05
serviceBase = clamp(amount × 0.0015, min 15, max 500)
subtaxBase  = amount + duty + serviceBase
vat         = subtaxBase × 0.15
tax         = duty + serviceBase + vat
```

### 4.9 Final total — and what "final" means

`total = subtotal + commission`. **Tax is NOT part of the total.** It is presented separately as an estimate the customer pays to the carrier on delivery (`whatsappMessage`, index.html:5314–5316).

### 4.10 Rounding

Internal arithmetic is full-precision floating point. Only the display rounds: `fmtMoney(n) = fmt0(roundUpToTen(n))`, and `roundUpToTen(n) = n > 0 ? Math.ceil(n/10)*10 : 0` — every displayed money figure is rounded **up to the nearest 10 SAR**. `fmt` (2 decimals) is used for weights and inline hints.

### 4.11 Complete worked order of operations

```
1  per product   price × exchangeRate × quantity                 → totalPrice
2  per product   localShippingCost × exchangeRate                → totalShipping (indirect only)
3  per product   carrier base rate (SAR, tier-rounded)
4                × (1 − discount/100)   [FedEx/DHL/FedEx-Eco]    → totalShipping
5  per product   restriction fees (dangerousGoods / lithium / packaging) → totalFees
6  per product   manual additional fee USD × exchangeRate        → totalFees (non-direct only)
7                subtotal = totalPrice + totalShipping + totalFees
8                commission = subtotal < 2000 ? 50 : 100
9                total = subtotal + commission
10               tax = calcTax(totalPrice)     [reported separately, NOT added]
11               display = roundUpToTen(...)
```

---

## 5. Discount System

- **One global value**, `state.carrierDiscount` — not per product, not per carrier. Persisted in localStorage.
- **Allowed values:** `DISCOUNT_OPTIONS = [0, 10, 15, 20, 25]`. `cleanCarrierDiscount()` coerces anything else to `0`.
- **Default:** `15`. Applied once via the `discountDefaultApplied` migration flag in `loadState()` (index.html:4902–4907) — on first load (or for state saved before the flag existed) the discount is forced to 15 and the flag set.
- **Eligible carriers:** exactly `['fedex', 'dhl', 'fedex_economy']`. This literal array appears in **six** separate places: index.html:5097, 5118, 5170, 5173, 5205, 5241, 6260 (plus the same set inside `getCombinedMyusShipping`). Shop & Ship, MyUS Budget and MyUS Aramex never receive a discount.
- **Where applied:** `discountedPrice = shipping.price * (1 - discount/100)`, computed in `carrierOptionsForProduct` (index.html:5119), in `getCombinedMyusShipping` (5174), and again in `renderCombinedShipment` (6261).
- **Order relative to fees:** the discount applies to the carrier rate **only**. Restriction fees are added *after*: `finalPrice = discountedPrice + assessment.feeAmount`. `finalPrice` drives cheapest-carrier ranking; `discountedPrice` is what lands in the shipping bucket.
- **UI:** rendered as a chip row titled "خصم FedEx و DHL" inside `renderCarriers` (index.html:6181–6195) and again in `renderCombinedShipment` (6315). `setCarrierDiscount(d)` writes state and re-renders everything.
- **The bot has no discount concept at all.**

---

## 6. Additional Fees

Two independent families.

### 6.1 Manual additional fee (user-selected)

`ADDITIONAL_FEE_TYPES` (index.html:4826–4831): `none`, `usd9` ($9), `usd30` ($30), `custom` (free-form USD amount).

```js
manualAdditionalFeeUsd(p) = 9 | 30 | parseFloat(p.additionalFeeAmount) | 0
manualAdditionalFeeSar(p) = manualAdditionalFeeUsd(p) × p.exchangeRate
```

Rules stated in the comment at index.html:4833–4835: it applies to the shipping cost only, never to the product price or the commission. It is excluded for `shippingType === 'direct'` (index.html:5238). Choosing anything other than `custom` clears `additionalFeeAmount` (index.html:5600–5603). The field is collapsed by default and revealed by `toggleAdditionalFees()`.

### 6.2 Automatic restriction fees (rule-driven)

Fee codes and amounts — `feeAmountByCode(code, p, index)` (index.html:5073–5082):

| Code | Amount | Configurable key |
|---|---|---|
| `dangerousGoods` | `max(cfg.dangerousGoodsMinSar, productPriceSar × 0.08)` — **8% of product value with a 112 SAR floor** | `dangerousGoodsMinSar` (default 112) |
| `installedLithiumBattery` | flat `cfg.installedLithiumBatterySar` | default 30 |
| `specialPackaging` | flat `cfg.specialPackagingSar` | default 90 |

Note the `0.08` multiplier is a **magic number inline in the function**, not a named constant, and is the only fee component not exposed in the settings modal.

**Which rules produce which fee** (all under `extraFees.myus` — Shop & Ship never receives extra fees, it blocks instead):

| Rule id | Fee(s) |
|---|---|
| `shopship_perfume_flammable_liquid` (perfume, cologne, nail polish, acetone…) | `dangerousGoods` |
| `shopship_glue_adhesive` | `dangerousGoods` |
| `shopship_paint_thinner` | `dangerousGoods` + `specialPackaging` |
| `shopship_aerosol_spray` | `dangerousGoods` |
| `shopship_lithium_installed` | `installedLithiumBattery` |
| `shopship_lithium_loose` (incl. power banks) | `dangerousGoods` |

**When they apply.** `shippingAssessmentForCarrier(p, carrier, index)` (index.html:5084–5102):
1. Match rules against the product text.
2. If any matched rule lists this carrier's `source` in `blocked` → status `blocked`, `feeAmount: 0`, reason = the first blocking rule's reason.
3. Otherwise collect `rule.extraFees[carrier.source]` codes, dedupe, sum their amounts.
4. **MyUS channel restriction:** if `carrier.source === 'myus'` and `feeAmount > 0` and the carrier is **not** DHL/FedEx/FedEx-Economy → status `hidden`, reason "منتجات الرسوم الإضافية في MyUS تشحن عبر DHL و FedEx فقط". Hidden carriers are dropped from the list entirely (index.html:5107).
5. Otherwise status `allowed`.

**Where they land in the total.** `getProductSummary` puts `automaticExtraFeeAmount` into `additionalFeeAmount` (fees bucket), not into shipping. `autoExtraFeeForSelectedCarrier` returns the fee only when status is `allowed` — a `blocked` selection contributes 0 fee. In combined mode the per-product fees are summed by `getCombinedMyusRestrictionSummary()` and added once.

**Configuration.** The three configurable amounts are read via `getRestrictionFeeConfig()` = `{...EXTRA_FEE_DEFAULTS, ...state.restrictionFeeConfig}` and written by the settings modal (index.html:7575–7579). Stored in localStorage — **per browser, not shared, not in the database**.

---

## 7. Product Restrictions — `SHIPPING_RESTRICTION_RULES`

Defined at index.html:4601–4800. **32 rules.** Each rule:

```js
{ id, reason, blocked: ['myus'|'shopship', …], extraFees?: { myus?: [codes] }, keywords: [ … ] }
```

### 7.1 Matching algorithm

- `productRuleText(p)` = `normalizeRuleText(p.name + ' ' + p.link + ' ' + p.productType)` — the **URL is part of the matched text**, so a keyword occurring anywhere in the product URL triggers the rule.
- `normalizeRuleText(v)` (index.html:5039–5049): lowercase → Arabic normalisation (`أإآ`→`ا`, `ى`→`ي`, `ة`→`ه`, strip diacritics `ًٌٍَُِّْـ`) → replace `/_.?&=#%+:-` with spaces → collapse whitespace → trim.
- `matchesAnyKeyword` does a plain `String.includes` on the normalized keyword. **Substring matching, no word boundaries** — e.g. the keyword `coin` matches "coincidence", `glass` matches "sunglasses", `stain` matches "stainless".
- Empty product text → no rules matched → nothing blocked.

### 7.2 Categories (grouped)

**Blocked on BOTH `myus` and `shopship` (20 rules)** — absolute prohibitions:
`firearms_weapons`, `explosives_fireworks`, `drugs_prescription`, `tobacco_vape`, `poison_toxic_infectious`, `radioactive_oxidizer_fire_extinguisher`, `fuel_lighters`, `pesticides_agriculture_chemicals`, `animals_plants_protected`, `food_perishable_mre`, `counterfeit_illegal_lottery_gambling`, `military_police_security`, `lock_picking`, `medical_restricted`, `coral_rosewood_caviar_mop`, `rough_diamonds`, `hoverboard_self_vehicle`, `damaged_batteries`, `human_remains`, `unidentified_material`.

**Blocked on `shopship` only (12 rules)** — of which 6 convert into MyUS surcharges (listed in §6.2) and 6 are Shop&Ship-only bans with no MyUS fee:
`shopship_fragile_items` (glass, ceramic, marble, musical instruments), `shopship_art_antiques`, `shopship_jewelry_metals_cards`, `shopship_laser_consumer`, `shopship_masks_scrubs_cosmetics_large`, `shopship_signal_satellite_drone_spy`.

Keyword lists are bilingual (English + Arabic) throughout.

### 7.3 Carrier restrictions

Restriction is expressed against `carrier.source` (`myus` / `shopship`), never against an individual carrier id — except the MyUS DHL/FedEx channel rule in §6.2 step 4, which is hard-coded in `shippingAssessmentForCarrier`.

### 7.4 Country restrictions

**None exist.** There is no country selector, no `country` field on a product, and no country dimension in any rule. `warehouses.country_id` exists in the database but the website never reads it.

### 7.5 Effect on the UI and on totals

Restricted (blocked) carriers are **not hard-blocked**. Per the comment at index.html:5109–5112 they are still priced so their cost can be compared, are sorted last (`sortedPricedCarrierOptionsForProduct`, index.html:5125–5132), are excluded from the cheapest-default pool, and are surfaced as a warning. A user may still select one, and if they do, `getProductSummary` honours it — but with `feeAmount: 0`, since a blocked assessment carries no fee.

---

## 8. WhatsApp Message Generation

Produced by `whatsappMessage()` (index.html:5291–5318). Called once per `renderSummary()`, written into `<pre id="waText">` (index.html:4374). Two consumers: the copy button (index.html:7522) and `window.open('https://wa.me/?text=' + encodeURIComponent(text))` (index.html:7529) — **no phone number is attached, deliberately** (comment at 7526–7528) so the user picks the contact.

### Template

```
🛍️ عرض سعر الطلب
                                                    ← blank line
[ single product ]                                  ← if state.products.length === 1
المنتج: {p.name}                                    ← omitted entirely if name is empty
الكمية: {max(1, p.quantity)}
[ multiple products ]
عدد المنتجات: {state.products.length}
{i+1}. {p.name} — الكمية: {max(1, p.quantity)}      ← one line per NAMED product only
                                                    ← blank line
💰 سعر المنتج + الشحن: {fmtMoney(totalPrice + totalShipping + totalFees)} ر.س
📋 العمولة: {fmtMoney(commission)} ر.س
                                                    ← blank line
✅ الإجمالي النهائي: {fmtMoney(total)} ر.س
                                                    ← blank line
📦 الرسوم الضريبية التقديرية: {fmtMoney(tax)} ر.س
تدفعها عند الاستلام من شركة الشحن.
للتأكد استخدم حاسبة الرسوم الجمركية والضرائب: {ZATCA_CALCULATOR_URL}
```

### Source of every value

| Line | Source |
|---|---|
| المنتج / product list | `state.products[].name` — products without a name are silently skipped in the multi-product list, while the count line still counts them |
| الكمية | `Math.max(1, parseFloat(p.quantity) || 1)` |
| سعر المنتج + الشحن | `c.totalPrice + c.totalShipping + c.totalFees` = `c.subtotal` |
| العمولة | `c.commission` |
| الإجمالي النهائي | `c.total` (= subtotal + commission) |
| الرسوم الضريبية التقديرية | `c.tax` = `calcTax(c.totalPrice)` |
| ZATCA link | `ZATCA_CALCULATOR_URL` constant |

**Formatting:** every money value goes through `fmtMoney` → rounded **up to the nearest 10** and printed with no decimals, `en-US` grouping. The message deliberately does **not** itemise shipping, discount, restriction fees, carrier, or weight — the customer sees only goods+shipping, commission, total, and estimated tax.

**Other message generators** (separate from the customer quote):
- `sellerEmailText(order)` (index.html:7048) — follow-up email to the seller.
- `copyOrder(id)` (index.html:6931) — customer name / national address / product links / international shipping price.
- `copyCustomerStatus(id)` (index.html:7074) — greeting + last shipment update date.
- Bot equivalent: `getCustomerQuoteText(session)` in `quote.formatters.ts`, which formats products/shipping and prints literal placeholders for commission, tax and total.

---

## 9. Product Weight System

### 9.1 `product_weights` table

DDL — `sql/007_create_product_weights.sql`:

```sql
create table if not exists public.product_weights (
  id           uuid primary key default gen_random_uuid(),
  product_url  text        not null,
  product_name text        not null,
  weight_lb    numeric     not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
grant select, insert, update, delete on public.product_weights to anon;
```

Only three fields are ever written by the app. **There is no unique constraint** on `(product_url, product_name)` — deduplication is done in JavaScript before writing.

### 9.2 Loading and the in-memory mirror

`loadSavedWeights()` (index.html:7745) selects `*` ordered by `updated_at desc` and maps rows into `state.savedWeights` as `{id, url, name, weight, updatedAt}`. `loadState()` explicitly resets `base.savedWeights = []` (index.html:4910) and `saveState()` destructures `savedWeights` and `orders` **out** of the persisted object (index.html:4947) — neither is ever written to localStorage; both are always DB-derived.

### 9.3 Matching rule — URL **and** name, both required

```js
normalizeMatchText(v) = String(v).toLowerCase().trim()      // NOT the Arabic normalizer
findSavedWeightMatch(url, name):
    if (!normalizedUrl || !normalizedName) return null       // both must be non-empty
    return savedWeights.find(w => norm(w.url) === u && norm(w.name) === n)
```

This is an **exact, case-insensitive, whitespace-trimmed equality on both fields simultaneously**. It is *not* fuzzy, *not* domain-based, and does not use `normalizeRuleText`. A different URL query string or a one-character name difference is a miss.

### 9.4 Auto-fill

Inside `updateProduct()` (index.html:5589–5592), whenever the `name` or `link` field changes, `checkSavedWeight(p.name, p.link)` runs and on a hit `fillSavedWeightForProduct` sets `p.weight = saved.weight`, `p.weightUnit = 'lb'`, `p.quantityWeightApplied = false`. The product card also shows the match with a manual "استخدام" button (`applySavedWeight`).

### 9.5 Saving and updating

`saveWeightFromProduct(productId)` (index.html:5387–5410):
1. Requires non-empty `link`, `name` and `weight` (toast otherwise).
2. Converts to lb: `weightUnit === 'kg' ? getWeightLb(weight,'kg') : parseFloat(weight)` — **the table always stores pounds**.
3. `findSavedWeightMatch` → `updateSavedWeightRow(existing.id, …)` or `createSavedWeightRow(…)`.
4. `await loadSavedWeights()` then `render()` — the local mirror is always refreshed from the DB, never patched in place.

`deleteSavedWeight(id)` deletes the row then filters the local array. `updateSavedWeightRow` writes `updated_at: new Date().toISOString()` explicitly from the client.

### 9.6 Excel round-trip

- **Export** `exportSavedWeightsExcel()` — sorted by name with `localeCompare(…, 'ar')`; columns `اسم المنتج / رابط المنتج / الوزن (رطل) / تاريخ آخر تحديث`; filename `saved_weights_YYYY-MM-DD.xlsx`.
- **Import** `importSavedWeightsFile(file)` — scans all sheets for a header row containing a name-alias, a url-alias and a weight-alias; then for each data row does the same find-then-update-or-insert against Supabase, one round trip per row (`await` inside the loop). Errors on individual rows are logged and skipped; zero successful rows throws.

### 9.7 Other weight helpers

| Function | Behaviour |
|---|---|
| `getWeightLb(w, unit)` | `unit==='kg' ? w × 2.20462 : w`; `<=0` → 0 |
| `getWeightKg(w, unit)` | `unit==='kg' ? w : w ÷ 2.20462` |
| `convertWeightUnit(id)` | Toggles the unit **and rewrites the value** with `fmt()` (2 decimals) |
| `applyQuantityWeightSuggestion(id)` | `weight × quantity`, sets `quantityWeightApplied = true`; offered only when `quantity > 1` and not yet applied |
| `estimateWeight(id)` | Fakes a 950 ms "AI" spinner, then copies `weightPrompt(p)` to the clipboard for the user to paste into ChatGPT. **No AI call is made.** |
| `p.weightSource` | Free-text field, stored and rendered — **never read by any calculation** |

The bot has no saved-weight feature: it asks for one total shipment weight in lb (`indirect_shipping_weight`) and offers `estimateWeightKeyboard`, which likewise just prints a prompt for the operator to paste elsewhere.

---

## 10. Supabase — Database Documentation

### 10.1 `warehouses`

**Purpose:** a physical/legal origin warehouse. The same provider has one row per origin country, so **names are not unique** — this is why `code` exists.

| Column | Type | Notes |
|---|---|---|
| `id` | int | **PK**. The Telegram bot addresses warehouses by this. |
| `code` | text | Added by `003`, populated by `004`, then `unique (code)`. The **immutable identifier**; the website addresses warehouses by this. |
| `name` | text | Display only. `'MyUS'`, `'Shop & Ship'`. |
| `country_id` | int | **FK → `countries.id`**. Read only by the bot's `fetchWarehouses`; never used by the website. |

**Known rows** (from `sql/004_populate_codes.sql`, confirmed live on 2026-07-17 per its comment):

| id | code | country_id | Used by |
|---|---|---|---|
| 7 | `MYUS_US` | 2 (US) | website + `scrapers/myus_scraper.py` |
| 8 | `SHOPANDSHIP_US` | 2 (US) | website + `scrapers/shopandship_scraper.py` |
| 10 | `SHOPANDSHIP_SG` | 3 (SG) | nothing |
| 11 | `MYUS_UK` | 4 (UK) | nothing |
| 12 | `SHOPANDSHIP_UK` | 4 (UK) | nothing |

**UNCLEAR:** no `create table warehouses` DDL exists in any repository — the table predates these migration files. Column list above is the union of what the three code bases select. Indexes beyond the PK and `warehouses_code_key` are unknown.

### 10.2 `carriers`

**Purpose:** a carrier **service tier**, not a company. MyUS prices FedEx Economy and FedEx Priority separately, so they are two rows (`sql/002`).

| Column | Type | Notes |
|---|---|---|
| `id` | int | **PK**. Bot addresses carriers by this. |
| `code` | text | `unique (code)` after `004`. Website + scraper address carriers by this. |
| `name` | text | Display only. |

**Known rows:** 1 `BUDGET`, 2 `ARAMEX`, 4 `DHL`, 5 `SHOPANDSHIP_MEMBER`, 6 `FEDEX_ECONOMY`, 7 `FEDEX_PRIORITY`. **id 3 has no code assigned in `004`** — per the comments this is the original generic `'FedEx'` row, deliberately left untouched and unused. Shop & Ship's non-member ("Original") price is scraped but discarded by explicit product decision.

**Business consequence:** the website's `CARRIERS` array is a curated 6-entry view over this table. Adding a carrier row to the database does **not** make it appear on the website; adding it to the bot's list is automatic, because the bot lists carriers straight from the table.

### 10.3 `shipping_rates`

**Purpose:** the rate matrix — one row per (warehouse, carrier, weight tier). This is the single source of truth for all shipping prices in the system.

| Column | Type | Notes |
|---|---|---|
| `id` | ? | **UNCLEAR** — never selected by any code |
| `warehouse_id` | int | **FK → warehouses.id** |
| `carrier_id` | int | **FK → carriers.id** |
| `weight` | numeric | The tier. Validator range `[0.01, 1000]` |
| `price` | numeric | Validator range `[0.01, 100000]` |
| `currency` | text | 3 uppercase letters (validator regex `^[A-Z]{3}$`). MyUS rows default `USD`; Shop&Ship emergency import writes `SAR` |
| `delivery_days` | text \| null | Free text; both consumers fall back to `''` |
| `import_batch_id` | text | Added by `005`. **FK-like → import_batches**, traceability |

**Unique constraint:** `shipping_rates_warehouse_carrier_weight_key unique (warehouse_id, carrier_id, weight)` (`sql/001`) — required for the Python repository's `on_conflict="warehouse_id,carrier_id,weight"` upsert; without it Postgres raises 42P10.

**Grants:** `select` to `anon` (`006`), full DML to `service_role` (`000`).

**Weight unit:** the column is unitless in the schema. The whole system treats it as **pounds** — the website converts kg→lb before lookup, and the legacy importer's `fileWeightToLb` converts on import.

### 10.4 `product_weights`

Full DDL in §9.1. **Purpose:** remember the researched shipping weight of a product so it does not have to be looked up twice — and, per the file comment, so it is shared across browsers and devices instead of being per-browser localStorage. Business key is the `(product_url, product_name)` pair, enforced only in application code.

### 10.5 `orders`

**Purpose:** the order-tracking board (the Orders tab). Every order is stored as **one JSON blob**.

Columns actually used by the code (index.html:7682–7738):

| Column | Evidence |
|---|---|
| `payload` | `insert([{payload: order}])`, `select('*') → row.payload`, filtered with `.eq('payload->>id', order.id)` — a JSON-path filter, so `payload` is `json`/`jsonb` |
| `created_at` | `.order('created_at', {ascending: false})` |
| `updated_at` | `update({payload, updated_at: new Date().toISOString()})` |

**⚠️ UNCLEAR — this is the largest documentation gap in the system.** There is **no DDL for `orders` anywhere** in any of the three repositories, and no grant statement for it either (`sql/007`'s comment says it "mirrors the existing `orders` table access pattern", implying grants were applied manually outside version control). Its primary key, whether `payload` is `json` or `jsonb`, and whether any index exists on `payload->>'id'` are all unknown. Since **every** update and delete filters on `payload->>'id'`, an unindexed `payload` column means a full table scan per write.

**Shape of `payload`** (from `orderTemplate()`, index.html:4882–4887, plus `readOrderForm`):
`id, customerName, customerShortTitle, orderNumber, sellerOrderNumber, sellerName, whatsappLink, productLink, productName, trackingNumber, localTracking, intlTracking, carrier, status, purchaseDate, statusUpdatedAt, notes, products[], shipments[], indirectShippingCustomer, createdAt`.

`status` ∈ `purchased | to_mailbox | in_mailbox | international | delivered`. `orderNumber` is generated client-side as `ORD-YYYYMMDD-NNN` where NNN is `orders.length + 1` — **not collision-safe across devices**.

### 10.6 `import_batches`

DDL in `sql/005`:

```sql
create table if not exists import_batches (
    import_batch_id text primary key,
    source          text not null,
    version         text not null,
    started_at      timestamptz not null,
    finished_at     timestamptz,
    record_count    integer not null default 0,
    inserted        integer not null default 0,
    updated         integer not null default 0,
    skipped         integer not null default 0,
    failed          integer not null default 0
);
grant select, insert, update on public.import_batches to service_role;
```

**Purpose:** traceability — every `shipping_rates` row carries the `import_batch_id` of the scraper run that produced it, so any price can be traced back to a run, a scraper version, and a time window. Written only by the Python pipeline; **neither the website nor the bot reads it**.

### 10.7 `countries`

Referenced by `warehouses.country_id`. Known ids from `sql/004`'s comment: `2 = US`, `3 = SG`, `4 = UK`. **NOT FOUND:** no DDL, and no code in any of the three code bases queries this table.

### 10.8 Relationship diagram

```
countries ──1:N──> warehouses ──┐
                                ├──N:M via──> shipping_rates <──N:1── import_batches
carriers ───────────────────────┘                (unique: warehouse_id, carrier_id, weight)

product_weights   (standalone — no FK; business key = (product_url, product_name))
orders            (standalone — everything inside a single JSON payload column)
```

---

## 11. API Layer

### 11.1 Inventory

| Kind | Count | Detail |
|---|---|---|
| Custom REST backend | **0** | none exists in any repo |
| Supabase Edge Functions | **0** | verified by grep |
| Postgres RPC functions | **0** | verified by grep |
| Supabase table queries (website) | 11 | listed below |
| Supabase table queries (bot) | 4 | listed below |
| Supabase table queries (scraper) | 5 | via `ShippingRepository` |
| Outbound HTTP (bot) | 1 | `POST {API_BASE_URL}/quotes` — **target does not exist** |

### 11.2 Website Supabase calls

Client: `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` at index.html:7659, with the URL and publishable key **hard-coded in the HTML source** and exposed as `window.db` so the module block can reuse the instance.

**Shipping (via `ShippingGateway`, `src/shipping/repository.js`):**

| Call | Query |
|---|---|
| `fetchWarehousesAndCarriers()` | `from('warehouses').select('id, code, name')` ∥ `from('carriers').select('id, code, name')` (parallel) |
| `fetchRates(wid, cid)` | `from('shipping_rates').select('weight, price, currency, delivery_days').eq('warehouse_id', wid).eq('carrier_id', cid)` |

**Orders** (index.html:7677–7738 — "the ONLY place that communicates with Supabase for orders"):

| Function | Query | Notes |
|---|---|---|
| `loadOrders()` | `select('*').order('created_at', {ascending:false})` | On error: toast + returns, leaving `state.orders` at its previous value |
| `createOrder(order)` | `insert([{payload: order}]).select().single()` | throws on error |
| `updateOrder(order)` | `update({payload, updated_at}).eq('payload->>id', order.id).select().single()` | JSON-path filter |
| `deleteOrder(id)` | `delete().eq('payload->>id', id)` | |

**Saved weights** (index.html:7740–7807 — same single-place rule):
`loadSavedWeights()` (`select('*').order('updated_at', desc)`), `createSavedWeightRow`, `updateSavedWeightRow(id, …)` (`.eq('id', id)`), `deleteSavedWeightRow(id)`.

### 11.3 Bot Supabase calls

Client: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` — `lib/supabase.ts`. All queries live in `ShippingGateway` (`shipping/shipping.gateway.ts`):

| Method | Query |
|---|---|
| `fetchWarehouses()` | `from('warehouses').select('id, country_id, name').order('name')` |
| `fetchCarriers()` | `from('carriers').select('id, name').order('name')` |
| `fetchRateTablesByCarrier(wid)` | `from('shipping_rates').select('carrier_id, weight, price, currency, delivery_days, carriers(name)').eq('warehouse_id', wid)` — **embedded join** on `carriers` |
| `fetchRateTableForCarrier(wid, cid)` | same + `.eq('carrier_id', cid)` |

The bot never touches `orders` or `product_weights`. It never selects `warehouses.code` or `carriers.code`.

### 11.4 The one outbound REST call

`api/quote.client.ts`:

```
POST {API_BASE_URL}/quotes
Content-Type: application/json
body = QuotePayload   (see types/quote-api.ts)
```

`.env` sets `API_BASE_URL=http://localhost:3000`. Guard: an empty `API_BASE_URL` returns a friendly failure instead of throwing. On success returns `{success, status, data}`; on any axios error returns `{success:false, errorMessage:'فشل إرسال التسعيرة: …'}`.

**`QuotePayload` contract** (`types/quote-api.ts`), built by `buildQuotePayload`:

```jsonc
{
  "quoteType": "single" | "multi",
  "products": [{ "name", "url", "website", "price", "currency", "quantity", "localShipping", "category" }],
  "shipping": {
    "method": "direct" | "indirect" | null,
    "company": string|null,
    "internationalShippingCost": number|null,   // only when method === "direct"
    "shipmentWeight": number|null,              // only when method === "indirect"
    "warehouse": string|null,                   // warehouse NAME, not id or code
    "price": number|null,                       // already SAR
    "currency": string|null                     // literal "SAR"
  }
}
```

**UNCLEAR:** nothing in these repositories implements `POST /quotes`. There is no server on port 3000 in `موقع الشحن` (which has no dependencies and no scripts at all) or in `اسعار الشحن المحدثة`. This endpoint is either external, or not yet built.

---

## 12. State Management

**React, Context, Redux: none. There is no React anywhere in this system.**

### 12.1 Website

| Store | Key / mechanism | Contents | Lifetime |
|---|---|---|---|
| **Module-scoped mutable global** | `let state` (index.html:4889) | products, commissionConfig, restrictionFeeConfig, carrierDiscount, orderType, orderShippingMode, recentQuotes, currentQuoteId, savedWeights, orders | page session |
| **localStorage — main state** | `shipping-calculator-mobile-v3` | `state` **minus** `orders` and `savedWeights` (destructured out in `saveState`, index.html:4947) | persistent, per browser |
| **localStorage — offline rates** | `shipping_offline_cache_v1` | `{ "WH::CARRIER": { table, savedAt } }` | persistent |
| **localStorage — feature flags** | `shipping_feature_flags_v1` | overrides for the 4 flags | persistent |
| **localStorage — dev mode** | `shipping_dev_mode` | `'1'` when on; set by `?dev=1` and sticky thereafter | persistent |
| **In-memory rate cache** | `ShippingProvider._rateTableCache` (a `Map`) | one rate table per pair | page session; avoids duplicate network calls |
| **Metadata maps** | `_warehousesByCode`, `_carriersByCode` | code → row | page session, loaded once |
| **Module-scoped UI globals** | `aiLoadingProductId` (4890), `currentOrderNotes`, `toast._t` | transient UI | page session |
| **The DOM itself** | order form inputs, `#orderProductRowsContainer`, `#shipmentsContainer`, `#orderSearch`, `#savedWeightSearch` | order-editing state | until read back by `readOrderForm()` / `readShipments()` |
| **Supabase** | `orders`, `product_weights` | the durable records | permanent, cross-device |

**Update cycle:** every input's `oninput` calls `updateProduct(id, field, value, shouldRender)`. With `shouldRender = false` (used on text/number inputs to avoid losing focus) it calls `renderSummary()` + `updateProgressiveVisibility(id)` only; `onblur="render()"` then does the full re-render. `render()` re-renders **everything**, including the whole Orders board (index.html:6597–6614).

**Note:** the order form is genuinely DOM-as-state — there is no JS object mirroring the form while the user types; `readOrderForm()` reads it back out of the DOM on save.

### 12.2 Bot

| Store | Mechanism | Lifetime |
|---|---|---|
| `ctx.session` | grammY `session({initial: initialSession})` — **default in-memory storage** | **lost on process restart** |
| `SessionData` | `{quoteType, draft}` where `draft` holds products, activeProductId, currentStep, lastPromptMessageId, and the whole shipping selection | per chat |
| `draft.lastPromptMessageId` | the id of the message the bot edits in place instead of sending new ones (`updatePrompt` in `message.handler.ts`) | per chat |

No Redis, no `@grammyjs/storage-*`, no database persistence of session. No cache of shipping data at all — the bot re-queries Supabase on every warehouse/carrier screen.

---

## 13. Complete User Flow

### 13.1 Website — the real flow

```
0. LOAD
   module block → new ShippingProvider(window.db) → window.initApp()
   ├─ loadOrders()          → state.orders
   ├─ loadSavedWeights()    → state.savedWeights
   └─ ShippingProvider.boot(6 pairs) → READY | OFFLINE | FAILED
   → render()   (renderOrderTypeGate hides the calculator until a type is chosen)

1. ORDER TYPE GATE            selectOrderType('singleSite' | 'multiSite')
   · singleSite → orderShippingMode forced to 'independent'; every product after
                  the first has its shipping/weight/fee fields cleared
   · multiSite  → user then chooses per-product shipping (independent) or
                  addProductWithMode('myusCombined'), which forces every product
                  to shippingType 'indirect'

2. ADD PRODUCT                state.products.push(productTemplate())

3. ENTER PRODUCT INFORMATION  price · quantity · link · name · productType
   · Progressive disclosure: `data-stage="after-price"` blocks stay hidden until
     price > 0; `after-shipping` blocks until a shipping type is chosen
   · On every name/link change → checkSavedWeight() → auto-fill weight if matched
   · On currency change → exchangeRate reset to the currency's defaultRate

4. SHIPPING TYPE              p.shippingType = 'direct' | 'indirect'
   · direct  → directShippingCost + currency + rate. Weight, carriers and both
               fee families are skipped entirely.
   · indirect→ localShippingCost, then the weight block

5. WEIGHT DETECTION           (indirect only)
   · saved-weight match shown inline with a "استخدام" button
   · manual entry + lb/kg toggle + convertWeightUnit()
   · quantity suggestion: weight × quantity, one-click
   · "تقدير الوزن" copies a ChatGPT prompt (no AI call)
   · "حفظ الوزن" upserts into product_weights (always stored in lb)

   ── COUNTRY SELECTION: DOES NOT EXIST IN THIS SYSTEM ──

6. CARRIER SELECTION          renderCarriers(p), only when price>0 && indirect && weight
   sortedPricedCarrierOptionsForProduct(p, index, includeBlocked=true):
     for each of the 6 CARRIERS:
       assessment = shippingAssessmentForCarrier(...)
         · 'hidden'  → drop (MyUS non-DHL/FedEx carrying an extra fee)
         · 'blocked' → keep only when includeBlocked
       · drop if that source's rates aren't loaded
       · shipping = lookupShipping(weight, unit, carrier.id); drop if price is 0
       · discount = eligible ? state.carrierDiscount : 0
       · discountedPrice = price × (1 − discount/100)
       · finalPrice = discountedPrice + assessment.feeAmount
     sort: non-blocked first → then by finalPrice → then by original order
   The first non-blocked option becomes the default, but ONLY if the user's
   current p.carrierId is no longer a valid option (index.html:6148-6153).

7. SHIPPING CALCULATION       getProductSummary(p, index) per product
8. DISCOUNT                   already folded into discountedPrice in step 6
9. FEES                       manual (USD→SAR) + automatic restriction fees
10. COMMISSION                subtotal < 2000 ? 50 : 100
11. TOTAL                     subtotal + commission
12. TAX                       calcTax(totalPrice) — displayed, NOT added

13. CUSTOMER MESSAGE          whatsappMessage() → #waText, regenerated on every render
                              · copy to clipboard, or open wa.me with no number

14. QUOTE AUTOSAVE            autosaveCurrentQuote() runs inside renderSummary():
                              keeps the last 3 quotes in state.recentQuotes
                              (localStorage), keyed by state.currentQuoteId

15. ORDER MANAGEMENT          convertQuoteToOrder(id):
                              · multiSite → one `shipment` per product, each with
                                its own status
                              · createOrder() → Supabase → loadOrders() →
                                switchPage('orders')
                              Kanban board by status; per-order and per-product and
                              per-shipment status dropdowns; notes with timestamps;
                              staleness alerts (see below); seller-email / customer-
                              status / order-copy text generators.
```

**Staleness alerts** — `orderAlertInfo(order)`: `delivered` orders never alert. `purchased` orders alert at **level danger** after **≥2 business days** without a status update (weekends excluded by `businessDaysSince`) and offer a seller follow-up email. Orders in `to_mailbox | in_mailbox | international` alert at **level warn** after **≥3 calendar days**.

### 13.2 Bot — the legacy flow (the one that works)

```
/start → mainKeyboard [إنشاء تسعيرة | إدارة الطلبات | الإعدادات]
   · ORDERS and SETTINGS are placeholder screens with only a back button

CREATE_QUOTE → quoteKeyboard → QUOTE_SINGLE | QUOTE_MULTI
   setQuoteType() wipes the whole draft

ADD_PRODUCT → step 'url'
  text → validateUrl (adds https:// when missing, http/https only, strips www.)
       → Product created; in "single" mode currency/quantity/localShipping are
         inherited from the previous product
  → 'name' → 'price' → 'currency' (buttons) → 'quantity' (buttons or custom)
  → 'localShipping' ("مجاني" = 0) → 'category' (or skip) → back to product list

CONTINUE_QUOTE → beginShippingMethodSelection()
   ├─ DIRECT   → 'direct_shipping_cost' → text → plainCarrierKeyboard(all carriers)
   │             → SELECT_CARRIER_ → setShippingCompany(name)  [no price]
   └─ INDIRECT → 'indirect_shipping_weight' (lb) → text
                 → warehouseKeyboard(all warehouses)   ← THE ONLY "COUNTRY"-LIKE CHOICE
                 → SELECT_WAREHOUSE_<id>
                 → getCarrierRatesSortedByPrice(warehouseId, weight)
                 → priceCarrierKeyboard  ("<name> - <price> SAR", cheapest first)
                 → SELECT_CARRIER_<id> → getSelectedCarrierRate → setShippingCompany(name, price, "SAR")

quote_summary → GENERATE_CUSTOMER_QUOTE → customer_quote screen
   Buttons: COPY_MESSAGE  → "📋 سيتم تفعيل خاصية النسخ لاحقًا." (not implemented)
            SEND_TO_WEBSITE → POST {API_BASE_URL}/quotes
            EDIT_QUOTE / NEW_QUOTE
```

The bot never computes discount, restriction fees, commission, tax, or a total. Its customer message prints "سيتم احتسابها من قبل الموقع" for all three.

---

## 14. Telegram Bot Integration

This section describes what **is**, then what the code itself implies about the intended target architecture. Recommendations are limited to what the codebase's own comments and structure already commit to.

### 14.1 What is already shared

Nothing is *shared* as code. `ShippingCalculator` (bot, TypeScript) is a **hand-ported duplicate** of `CalculatorEngine` (website, JavaScript) — its own header says so: "ported to TypeScript so the Website, Telegram Bot, API, and Dashboard can all depend on this one module instead of re-implementing the rules." That intent is stated but not yet realised: the website still uses its own copy.

Duplicated in both code bases today:
- Weight-tier lookup + cap rule (`nearestAvailableWeight`, `Math.ceil`)
- `USD_TO_SAR = 3.75`
- The Supabase table/column contract for `warehouses`, `carriers`, `shipping_rates`

### 14.2 What lives in only one place

| Capability | Website | Bot |
|---|---|---|
| `SHIPPING_RESTRICTION_RULES` (32 rules) | ✅ | ❌ |
| Restriction fees (8% dangerous goods, lithium, packaging) | ✅ | ❌ |
| Carrier discount | ✅ | ❌ |
| Manual additional fee ($9/$30/custom) | ✅ | ❌ |
| Commission tiers | ✅ | ❌ |
| Customs/VAT estimate | ✅ | ❌ |
| Combined MyUS shipment | ✅ | ❌ |
| Multi-currency exchange rates | ✅ (7 currencies) | ❌ (currency captured, never converted) |
| Saved product weights | ✅ | ❌ |
| Orders / quotes persistence | ✅ | ❌ |
| Warehouse choice at runtime | ❌ | ✅ |
| Offline cache + retry/health states | ✅ | ❌ |

### 14.3 Functions that would have to be reused

Pure, no DOM, no browser — directly portable:

`getWeightLb` · `getWeightKg` · `normalizeRuleText` · `matchesAnyKeyword` · `matchedShippingRules` · `feeAmountByCode` · `shippingAssessmentForCarrier` · `manualAdditionalFeeUsd` · `manualAdditionalFeeSar` · `calcTax` · `roundUpToTen` · `productPriceSar`* · `productLocalShippingSar` · `carrierOptionsForProduct`* · `sortedPricedCarrierOptionsForProduct`* · `cheapestCarrierOptionForProduct`* · `getProductSummary`* · `currentCalcs`* · `getCombinedMyusShipping`* · `whatsappMessage`* · `buildQuoteSnapshot`*

`*` = currently reads the module-global `state` and/or mutates it (see §16.3); each would need its inputs passed explicitly before it could be reused anywhere.

Plus the data constants: `CARRIERS`, `CURRENCIES`, `ADDITIONAL_FEE_TYPES`, `PRODUCT_TYPES`, `ORDER_STATUSES`, `SHIPPING_RESTRICTION_RULES`, and the 11 numeric constants.

### 14.4 What must stay in the frontend

`render*` (all ~25 of them), `escapeHtml`, `compactUrlLabel`, `toast`, `copyText`, `switchPage`, `openSettingsModal`, `updateProgressiveVisibility`, `readOrderForm`/`readShipments`/`readOrderProductRows` (DOM readers), the `window.*` bindings, `exportSavedWeightsExcel`/`importSavedWeightsFile`/`rowsFromFile` (SheetJS + `File` API), `OfflineCache` and all feature-flag/dev-mode helpers (`localStorage` + `window.location`).

### 14.5 What the code itself argues should become shared/backend

The system already has **two** consumers of the pricing rules (website, bot) and one stated third (`ShippingCalculator`'s header names "the API"). The natural split implied by the existing structure:

- **A shared pure package** (`@shipping/core`): the constants, `SHIPPING_RESTRICTION_RULES`, weight conversion, tier lookup, restriction assessment, fee computation, and `calcTax`. All pure functions, no IO — this is the largest and highest-value extraction, and the bot's calculator file already declares that as its purpose.
- **A shared data-access layer**: one gateway contract over `warehouses`/`carriers`/`shipping_rates`. Note the two implementations currently disagree on the lookup key (**code** vs **numeric id**) — that has to be reconciled first.
- **An endpoint that actually implements `POST /quotes`**, since the bot already calls it and the payload contract is already written (`types/quote-api.ts`).

Whether that lands in Supabase Edge Functions or in a Node service is a decision the code base does not currently make either way.

---

## 15. Business Logic Inventory

### 15.1 Website — shipping layer

| Function | Purpose | Inputs | Outputs | Dependencies |
|---|---|---|---|---|
| `ShippingProvider.boot(pairs)` | Full startup sequence | `[[whCode, carCode], …]` | `Promise<HealthState>` | health service, gateway, cache |
| `ShippingProvider.retry(pairs?)` | Re-run boot for the last pairs | optional pairs | `Promise<HealthState>` | `boot` |
| `ShippingProvider.getRate(wh, car, lb)` | Tier lookup for one pair | codes + lb | `ShippingRate\|null` | `_rateTableCache`, `CalculatorEngine` |
| `ShippingProvider.isReady(wh, car)` | Has a non-empty cached table? | codes | boolean | `_rateTableCache` |
| `ShippingProvider.importEmergencyTable(wh, car, table)` | Manual last-resort seed | codes + RateTable | boolean | dev mode + `EMERGENCY_IMPORT` flag |
| `ShippingGateway.fetchWarehousesAndCarriers()` | Metadata | — | `{warehouses, carriers}` | Supabase |
| `ShippingGateway.fetchRates(wid, cid)` | Raw rate rows | ids | row array | Supabase |
| `CalculatorEngine.getRate(table, lb)` | Pure tier lookup | table, lb | `ShippingRate\|null` | `nearestAvailableWeight` |
| `nearestAvailableWeight(table, w)` | Smallest tier ≥ w, else highest + `capped` | table, weight | `{weight, capped}\|null` | none (pure) |
| `withRetry(op, opts)` | N attempts, linear backoff | fn + config | op result / rethrow | none (pure) |
| `ShippingHealthService.run(live, offline)` | State machine, never throws | 2 callbacks | `Promise<HealthState>` | `withRetry` |
| `OfflineCache.save/load/getSavedAt/has/hasAny/clear` | Durable rate persistence | key, table | — / table | `localStorage` |
| `getFeatureFlag/setFeatureFlag/isDevModeEnabled/setDevMode` | Runtime toggles | flag name | boolean | `localStorage`, `location` |

### 15.2 Website — pricing and rules

| Function | Purpose | Inputs | Outputs | Dependencies |
|---|---|---|---|---|
| `lookupShipping(weight, unit, carrierId)` | The one product↔shipping boundary | weight, unit, carrier id | `{price(SAR), lb, capped, priceUsd, deliveryDays}` | `getWeightLb`, `CARRIERS`, `ShippingProvider`, `USD_TO_SAR` |
| `getWeightLb/getWeightKg` | Unit conversion | value, unit | number | `KG_TO_LB` |
| `productPriceSar(p, index)` | Goods value in SAR | product, index | number | **global `state`** (single-site rate rule) |
| `productLocalShippingSar(p)` | Local leg in SAR | product | number | — |
| `normalizeRuleText(v)` | Arabic+Latin text normalisation | string | string | — (pure) |
| `productRuleText(p)` | name + link + type, normalised | product | string | `normalizeRuleText` |
| `matchedShippingRules(p)` | Rules whose keywords hit | product | rule array | `SHIPPING_RESTRICTION_RULES` |
| `feeAmountByCode(code, p, index)` | One fee's SAR amount | code, product, index | number | `getRestrictionFeeConfig`, `productPriceSar` |
| `shippingAssessmentForCarrier(p, carrier, index)` | allowed / hidden / blocked + fee | product, carrier, index | `{status, reason, rules, feeAmount, feeCodes}` | the two above |
| `carrierOptionsForProduct(p, index, includeBlocked)` | Priced, filtered carrier list | product, index, flag | option array | assessment, `lookupShipping`, `state.carrierDiscount`, readiness gates |
| `sortedPricedCarrierOptionsForProduct(…)` | Same, ordered | same | ordered array | above |
| `cheapestCarrierOptionForProduct(p, index)` | First non-blocked | product, index | option \| null | above |
| `autoExtraFeeForSelectedCarrier(p, index)` | Fee for `p.carrierId` when allowed | product, index | number | assessment |
| `getCombinedMyusProductStatus(index)` | Per-product status against a DHL probe carrier | index | `{blocked, reason, feeAmount}` | **global `state`** |
| `getCombinedMyusRestrictionSummary()` | Aggregate for the combined shipment | — | `{blocked, reason, feeAmount, hasExtraFee}` | above |
| `getCombinedMyusShipping(weightLb)` | Cheapest MyUS carrier for the summed weight | lb | `{price, shippingOnly, extraFeeAmount, carrier, discount, lb, capped, …}` | `lookupShipping`, discount, restrictions |
| `calcTax(amount)` | Customs duty + service + VAT | SAR amount | number | 5 tax constants |
| `getProductSummary(p, index)` | Per-product price/shipping/fees; **also writes `p.carrierId`** | product, index | `{priceRsar, shippingRsar, shippingInfo, additionalFeeAmount, automaticExtraFeeAmount, discount}` | most of the above |
| `currentCalcs()` | The whole order total | — (reads `state`) | `{totalPrice, totalShipping, totalFees, totalLocalShipping, subtotal, commission, total, tax, threshold, lowCommission, highCommission, combinedWeightLb, combinedMyusShipping}` | everything above |
| `whatsappMessage()` | Customer message | — | string | `currentCalcs`, `fmtMoney`, `ZATCA_CALCULATOR_URL` |
| `internationalShippingForProduct(p)` | Cheapest option's customer-facing shipping price | product | `{price, carrier, lb}` | `cheapestCarrierOptionForProduct` |
| `currentInternationalShippingSummary(c)` | Total international shipping + carrier label | calcs | `{total, carrier}` | above; `'متعدد'` when carriers differ |
| `buildQuoteSnapshot(c)` | Quote record | calcs | quote object \| null | `quoteProductRows`, `roundUpToTen` |
| `autosaveCurrentQuote(c)` | Keep last 3 quotes | calcs | — (mutates state) | `buildQuoteSnapshot`, `saveState` |
| `convertQuoteToOrder(id)` | Quote → Supabase order | quote id | Promise | `createOrder`, `loadOrders`, `switchPage` |
| `orderAlertInfo(order)` | Staleness alert | order | `{level, email, text}` \| null | `businessDaysSince`, `calendarDaysSince` |
| `findSavedWeightMatch(url, name)` | Exact dual-field match | url, name | saved weight \| null | `state.savedWeights` |
| `saveWeightFromProduct(id)` | Upsert a weight | product id | Promise | Supabase weight functions |

### 15.3 Bot

| Function | Purpose | Inputs | Outputs | Dependencies |
|---|---|---|---|---|
| `ShippingCalculator.getRate(table, lb)` | Pure tier lookup + SAR conversion | table, lb | `CalculatedRate\|null` | `convertToSar` |
| `convertToSar(price, currency)` | USD × 3.75, else identity | number, string | number | — |
| `TelegramShippingProvider.getRatesForWeight(wid, w)` | All carriers priced, cheapest first | ids | `CarrierRate[]` | gateway, calculator |
| `TelegramShippingProvider.getRateForCarrier(wid, cid, w)` | One carrier | ids | `CarrierRate\|undefined` | gateway, calculator |
| `TelegramShippingProvider.calculateQuote(wh, car, w)` | Rich quote shape | objects | `ShippingQuote\|undefined` | **currently unused** |
| `ShippingGateway.fetchRateTablesByCarrier(wid)` | Grouped full tables | id | `Map<carrierId, {carrierName, table}>` | Supabase (with join) |
| `validateUrl(value)` | Normalise + validate a product URL | string | `{valid, url, website}` \| `{valid:false, errorMessage}` | `URL` |
| `quote.service.*` (24 exported functions) | Pure session state machine | `SessionData` + input | `ServiceResult` | `randomUUID`, `validateUrl` |
| `buildQuotePayload(model)` | Draft → API payload | session model | `QuotePayload` | — (pure) |
| `sendQuoteToWebsite(session)` | Guard + map + POST | session | `ServiceResult` | mapper, axios client |
| `renderDashboard(session)` | Pure session → `{text, keyboard}` | session | `RenderedScreen` | `escapeHtml`, `CALLBACKS` |
| `getQuoteSummaryText` / `getCustomerQuoteText` / `getProductListText` / `getProductPromptText` / `getShippingPromptText` / `formatAllPricesText` | All user-facing text | session / rates | string | — (pure) |

---

## 16. Hidden Dependencies

### 16.1 Hard-coded values

- **Supabase URL and publishable key are literals inside `index.html`** (7654–7655). No env file, no build-time injection; changing project means editing HTML.
- **Bot secrets live in `telegram-bot/.env`, committed to the working tree**: `BOT_TOKEN`, `OWNER_ID`, and a `SUPABASE_SERVICE_ROLE_KEY` (a JWT with `"role":"service_role"`, `exp` 2098). `.gitignore` in `telegram-bot` is **empty (0 bytes)**, so nothing is excluded from git there.
- **`OWNER_ID=581275889`** is read into `env` and **never used** — there is no owner/authorisation check anywhere in the bot. Any Telegram user who finds the bot gets the full flow.
- `warehouseCode`/`carrierCode` strings in `CARRIERS` must match `sql/004` exactly; a mismatch throws `Unknown warehouse_code/carrier_code combination` inside `_loadOneLive`, which fails the whole `Promise.all` and therefore the whole boot.

### 16.2 Magic numbers

| Value | Location | Meaning | Named? |
|---|---|---|---|
| `0.08` | index.html:5076 | dangerous-goods fee = 8% of product value | **no** |
| `950` | index.html:5522 | fake AI spinner duration (ms) | no |
| `2400` | index.html:5549 | toast display duration (ms) | no |
| `3` / `2` | index.html:6710 / 6703 | staleness thresholds (calendar days / business days) | no |
| `3` | index.html:6448, 6456 | recent-quotes retention count | no |
| `40` | index.html:5683 | URL truncation length | no |
| `10` | `roundUpToTen` | display rounding step | no |
| `6` / `8` | dashboard.ts | `COMPACT_THRESHOLD` / `MANAGE_THRESHOLD` | yes |
| `3.75` | index.html:4580 **and** shipping.calculator.ts:32 | USD→SAR, **duplicated across code bases** | yes, twice |
| `2.20462` | index.html:4579 | KG_TO_LB | yes |

### 16.3 Global state coupling

These functions read (and some write) the module-global `state` rather than taking it as a parameter — the main obstacle to reuse:

- **Read `state`:** `productPriceSar` (single-site exchange-rate rule), `carrierOptionsForProduct` / `getCombinedMyusShipping` / `getProductSummary` (`state.carrierDiscount`), `getRestrictionFeeConfig`, `currentCalcs`, `whatsappMessage`, `isMyusCombinedMode`, `isSingleSiteOrder`, `getCombinedMyusProductStatus`, `findSavedWeightMatch`, `internationalShippingForProduct` (calls `state.products.indexOf(p)`).
- **Write `state` from inside a "calculation":** `getProductSummary` assigns `p.carrierId = selected.id` (index.html:5227); `renderCarriers` assigns `p.carrierId` and calls `saveState()` (6150–6153); `autosaveCurrentQuote` mutates `state.recentQuotes` from inside `renderSummary`. Calling `currentCalcs()` is therefore **not side-effect free**.
- **Globals via `window`:** `window.db`, `window.ShippingProvider`, `window.XLSX`, `window.initApp`, `window.retryLoadShippingRates`, plus 28 handler functions assigned at index.html:7619–7647. Removing any breaks an inline `onclick` silently.

### 16.4 Feature flags

`FEATURE_FLAG_DEFAULTS` (constants.js:40): `SUPABASE_SHIPPING: true`, `OFFLINE_CACHE: true`, `EMERGENCY_IMPORT: false`, `DEBUG_SHIPPING: false`. Overridable at runtime via `localStorage['shipping_feature_flags_v1']` with no redeploy. **Developer Mode** is enabled by `?dev=1` (sticky — it writes `shipping_dev_mode='1'` and persists) or `setDevMode(true)` from the console. Emergency Import requires **both** dev mode and the flag.

### 16.5 Default values with business effect

`productTemplate()`: `currency: 'USD'`, `exchangeRate: 3.75`, `carrierId: 'budget'`, `weightUnit: 'lb'`, `additionalFee: 'none'`, `quantity: 1`, `shippingType: ''`.
`state` defaults: `carrierDiscount: 15`, `orderShippingMode: 'independent'`, `orderType: ''`, commission `{2000, 50, 100}`.
Bot: `DEFAULT_CURRENCY = 'USD'`, `DEFAULT_QUANTITY = 1`, `localShipping = 0`, `quoteType ?? 'single'` in the mapper, `currency ?? 'USD'`, carrier name fallback `'غير معروف'`.

### 16.6 Implicit contracts

- `shipping_rates.weight` is **assumed to be pounds**. Nothing in the schema says so.
- `shipping_rates.currency` is assumed `'USD'` or SAR-equivalent; **any third currency is silently treated as already-SAR** by both `lookupShipping` and `convertToSar`.
- `orders.payload` JSON shape is defined only by `orderTemplate()` — the database enforces nothing.
- `product_weights.weight_lb` is always pounds because the writer converts; nothing prevents a direct write in kg.
- Boot ordering: `initApp` references the bare global `ShippingProvider`, resolved at call time (documented at index.html:7833–7836). Calling `initApp()` before the module block runs would throw.
- `.eq('payload->>id', …)` requires `payload` to be JSON — a text column would silently match nothing.

### 16.7 Dead / unused code

- `MAX_LB = 50` — declared, never referenced.
- `telegram-bot/src/telegram/router.ts` — 0 bytes.
- `telegram-bot/src/lib/shipping.repository.ts` — marked `@deprecated`; still imported by nothing.
- `TelegramShippingProvider.calculateQuote()` and the `ShippingQuote` type — never called.
- The bot's Dashboard callbacks (`p:*`, `sh:*`, `q:cancel`, `nav:home`) — no handler.
- `currencyMainKeyboard` is imported in `quote.callbacks.ts` but never used there.
- `p.weightSource` — collected and displayed, never read by logic.
- `CALLBACK_ACTIONS.COPY_MESSAGE` — replies "will be enabled later".
- `bot.catch()` registered twice (`telegram/bot.ts:14` and `app.ts:14`).
- `carriers.id = 3` (the generic FedEx row) — deliberately left without a code.
- `warehouses` `MYUS_UK`, `SHOPANDSHIP_SG`, `SHOPANDSHIP_UK` — coded but unreachable from the website.

---

## 17. Telegram Migration Risk Analysis

*(If the website's pricing engine were moved into the bot.)*

### 17.1 Would work immediately — pure logic, zero browser dependency

`calcTax` · `getWeightLb` / `getWeightKg` · `normalizeRuleText` · `matchesAnyKeyword` · `matchedShippingRules` · `feeAmountByCode` · `shippingAssessmentForCarrier` · `manualAdditionalFeeUsd` / `manualAdditionalFeeSar` · `nearestAvailableWeight` · `CalculatorEngine.getRate` · `roundUpToTen` / `fmt` / `fmt0` · `productLocalShippingSar` · `uniqueList` · `cleanCarrierDiscount` · all of `SHIPPING_RESTRICTION_RULES`, `CARRIERS`, `CURRENCIES`, `ADDITIONAL_FEE_TYPES`, `PRODUCT_TYPES`, `ORDER_STATUSES` and every numeric constant.

The bot has already proved the shipping half of this: `shipping.calculator.ts` is a working line-for-line port.

### 17.2 Would break — browser dependencies

| Dependency | Used by | Breaks because |
|---|---|---|
| `window.localStorage` | `saveState`, `loadState`, `OfflineCache`, all feature-flag helpers, dev mode | Not in Node. Every flag read would throw or need a shim |
| `window.location` | `isDevModeEnabled` (`?dev=1`) | No URL in a bot process |
| `document.*` | all `render*`, `readOrderForm`, `readShipments`, `readOrderProductRows`, `toast`, `updateProgressiveVisibility`, `openSettingsModal` | No DOM |
| `navigator.clipboard` | `copyText`, `copyOrder`, `copySellerEmail`, `copyCustomerStatus`, `pasteIntoProductField` | No clipboard. Telegram has no copy API either — hence the bot's honest "will be enabled later" |
| `window.open` | `openWa`, `openOrderWhatsapp` | Bot must send a URL instead |
| `confirm()` | `clearCurrentOrder`, `deleteOrderAction`, `resetAll` | Would become a two-step inline-keyboard confirmation |
| `File` / `FileReader` / `XLSX` | `rowsFromFile`, saved-weight import/export, emergency import | Telegram sends Documents; SheetJS works in Node but the whole upload UX changes |
| `crypto.randomUUID` | `uid()` | Available in Node ≥ 19 / via `node:crypto` — trivial |
| `setTimeout` in `estimateWeight` | the fake spinner | Works, but the whole "copy a prompt for the human" pattern is browser-shaped |
| Inline `onclick` + `window.*` | 28 handlers | Every one becomes a callback_data route — and callback_data is capped at **64 bytes**, which the bot's own `callbacks.ts` already documents |

### 17.3 React dependencies

**None.** There is no React, no JSX, no hooks, no Context, no virtual DOM anywhere in this system. Nothing in the pricing engine depends on a framework. This is the single largest thing working in a migration's favour.

### 17.4 Would need redesign, not just porting

1. **Global mutable `state`.** Every pricing function reaches into one shared object. A bot serves many chats concurrently — `state` would have to become a per-session parameter. This is the real work.
2. **Calculation functions that mutate.** `getProductSummary` writes `p.carrierId`; `renderCarriers` writes it and saves; `autosaveCurrentQuote` fires from inside a render. These must become pure before they can be called from a request handler.
3. **Carrier identity mismatch.** The website's rules are keyed on `carrier.id` string literals (`'fedex'`, `'dhl'`, `'fedex_economy'`, `'shopship'`) and `carrier.source` (`'myus'`, `'shopship'`). The bot only ever sees numeric database ids and display names. Every restriction rule, discount check and channel rule would misfire until carrier identity is unified — this is the highest-risk item in the whole migration.
4. **Progressive UI.** The website's flow is enforced by CSS visibility stages; the bot must enforce it in the state machine.
5. **The Orders board.** Kanban, per-shipment statuses, staleness alerts and search have no natural Telegram representation.
6. **Concurrency + persistence.** grammY sessions are in-memory and lost on restart; the website relies on localStorage surviving reloads. Neither is acceptable for multi-user work — sessions would need durable storage.
7. **Key handling.** The bot currently runs on the **service_role** key, which bypasses Row Level Security entirely. Moving customer-facing pricing into that process widens the blast radius of any bug or prompt-injected input.

### 17.5 What should become backend logic

Given two consumers already exist and a third (`POST /quotes`) is already called:

- **Shared pure core** (constants + restriction rules + weight/tier math + fee math + `calcTax`) — must be one module, consumed by both. Highest value, lowest risk.
- **The one data gateway** over `warehouses`/`carriers`/`shipping_rates`, after reconciling code-vs-id.
- **`POST /quotes`** — the payload contract already exists; the implementation does not.
- **Commission/tax/fee configuration** — currently in each browser's localStorage, so two operators can quote the same order differently today. This is business configuration and belongs in the database.

### 17.6 What should stay in the frontend

All rendering, the Excel round-trip, clipboard/WhatsApp deep links, `OfflineCache`, feature flags and Developer Mode, and the DOM-backed order form.

---

## 18. Everything Required To Rebuild This System

### 18.1 Major modules

| # | Module | Where | What it owns |
|---|---|---|---|
| 1 | **Rate Ingestion** | `اسعار الشحن المحدثة` | Playwright scrapers → Normalizers (label→code) → Validator (ranges) → `ShippingRepository` upsert into `shipping_rates`, tagged with an import batch |
| 2 | **Shipping Data Layer** | `موقع الشحن/src/shipping/` | Gateway, in-memory cache, offline cache, retry/health state machine, pure tier calculator, feature flags |
| 3 | **Restriction Engine** | `index.html` | 32 keyword rules → blocked / hidden / allowed + fee codes |
| 4 | **Pricing Engine** | `index.html` | price → shipping → fees → subtotal → commission → total; tax reported separately |
| 5 | **Quote Layer** | `index.html` | last-3 autosaved quotes in localStorage; WhatsApp message generation |
| 6 | **Order Management** | `index.html` + Supabase `orders` | Kanban by status, per-product and per-shipment statuses, notes, staleness alerts, seller/customer message generators |
| 7 | **Saved Weights** | `index.html` + Supabase `product_weights` | dual-key (url+name) lookup, auto-fill, Excel round-trip |
| 8 | **Telegram Bot** | `telegram-bot` | data collection + shipping lookup only; no pricing |

### 18.2 Data flow, one line each

- **Rates in:** provider website → scraper → normalizer → validator → `shipping_rates` (upsert on warehouse+carrier+weight).
- **Rates out:** `shipping_rates` → `ShippingProvider` (memory + localStorage) → `lookupShipping` → carrier options → totals.
- **Quote out:** product inputs → `currentCalcs()` → `whatsappMessage()` → clipboard / `wa.me`.
- **Order in:** quote → `convertQuoteToOrder` → `orders.payload` → Kanban.
- **Weights:** product name+url → `product_weights` match → auto-fill; manual save → upsert.

### 18.3 Business rules — the complete set

**Pricing**
1. `productPrice = price × exchangeRate × quantity`.
2. In a single-site order, products after the first use product [0]'s exchange rate, and contribute **price only** — no shipping, no fees.
3. Direct shipping: `cost × its own rate`. No weight, no carrier, no fees of either kind.
4. Indirect shipping: `localShipping × exchangeRate` + the selected carrier's discounted rate.
5. Carrier rates are stored per weight tier; requested weight is **rounded up to a whole pound**, then to the next available tier, capping at the highest tier.
6. USD-priced rates convert at **3.75**; any other currency is treated as already SAR.
7. Discount `{0,10,15,20,25}`, default **15**, global, applies **only** to MyUS FedEx Priority, FedEx Economy and DHL — applied to the carrier rate before fees.
8. `subtotal = products + shipping + fees`.
9. `commission = subtotal < 2000 ? 50 : 100` (flat amounts, configurable).
10. `total = subtotal + commission`.
11. `tax = calcTax(productsOnly)` = 5% duty + clamp(0.15%, 15, 500) service + 15% VAT on (goods + duty + service). **Displayed separately; never added to the total.**
12. Every displayed money value is **rounded up to the nearest 10 SAR**.

**Restrictions**
13. Matching is substring-based on the normalised concatenation of product name + URL + type.
14. 20 rules block both providers; 12 block Shop & Ship only, of which 6 become MyUS surcharges.
15. Dangerous goods = `max(112 SAR, 8% of product value)`; installed lithium = 30 SAR; special packaging = 90 SAR (all three configurable).
16. A MyUS carrier that is not DHL/FedEx/FedEx-Economy is **hidden** when any restriction fee applies.
17. Blocked carriers are still priced and shown as warnings, sorted last, excluded from the cheapest default — but selectable, in which case they carry **zero** fee.

**Combined MyUS mode**
18. Only for multi-site orders with more than one product; weights are summed and priced once as a single shipment against MyUS carriers only.
19. Any blocked product blocks the whole combined shipment.

**Weights**
20. `product_weights` always stores pounds. A match requires **both** URL and name to be equal (case-insensitive, trimmed).

**Orders**
21. `purchased` orders alert (danger) after ≥2 **business** days without an update; `to_mailbox`/`in_mailbox`/`international` alert (warn) after ≥3 **calendar** days; `delivered` never alerts.
22. Order numbers are `ORD-YYYYMMDD-NNN` generated from the local order count.

### 18.4 Database usage — one line each

`warehouses` origin sites, keyed by immutable `code` (website) or `id` (bot) · `carriers` service tiers, same duality · `shipping_rates` the rate matrix, unique on (warehouse, carrier, weight) · `product_weights` researched product weights in lb · `orders` whole orders as one JSON payload · `import_batches` scraper-run traceability · `countries` referenced by `warehouses.country_id`, never queried.

### 18.5 Integration points

Supabase PostgREST (anon read from the browser, service_role read from the bot, service_role write from the scraper) · Telegram Bot API (long polling) · WhatsApp deep link (no number) · jsDelivr for SheetJS and supabase-js · MyUS/Shop&Ship websites via Playwright · `POST {API_BASE_URL}/quotes` (caller exists, callee does not).

---

## 19. Unclear / Incomplete — explicit list

Everything here is a gap in the source, not an inference.

| # | File / Function | Issue |
|---|---|---|
| 1 | **`orders` table** — no file | No DDL anywhere in any of the three repositories. Column types, primary key, whether `payload` is `json` or `jsonb`, and any index on `payload->>'id'` are all unknown. Every update and delete filters on `payload->>'id'`. |
| 2 | **`orders` grants** — no file | `sql/007`'s comment says it "mirrors the existing `orders` table access pattern", implying grants for `anon` were applied by hand outside version control. Not reproducible from the repo. |
| 3 | **`warehouses` / `carriers` / `shipping_rates` DDL** — no file | Only `alter table` migrations exist (`003`–`005`). The original `create table` statements are not in any repository, so the schema cannot be rebuilt from source. |
| 4 | **`countries` table** | No DDL, no query, no code. Only `sql/004`'s comment records `2=US, 3=SG, 4=UK`. Purpose beyond `warehouses.country_id` is unknown. |
| 5 | **`api/quote.client.ts` → `POST {API_BASE_URL}/quotes`** | The bot's terminal action posts to an endpoint that exists in **no** repository here. `.env` points at `http://localhost:3000`; `موقع الشحن/package.json` declares no dependencies and no scripts, so it is not that. Unknown whether the endpoint is external, planned, or abandoned. |
| 6 | **`constants/callbacks.ts` + `dashboard/dashboard.ts`** | Dashboard callback ids (`p:add`, `p:edit:`, `p:del:`, `p:manage`, `sh:m:direct`, `sh:m:indirect`, `sh:wh`, `sh:w`, `q:cancel`, `nav:home`) have **no handler** in `callback.handler.ts` or either callbacks file. Every Dashboard button is inert. The header says "Commit 1 scope", so this appears intentional and unfinished — but as shipped, `/dashboard` is a read-only screen. |
| 7 | **`telegram/router.ts`** | Zero-byte file. Intent unknown. |
| 8 | **`TelegramShippingProvider.calculateQuote()`** | Fully implemented, returns the richest shape in the bot, called by nothing. |
| 9 | **`index.html:4578` `MAX_LB = 50`** | Declared, never referenced. Cannot tell whether a 50 lb ceiling was intended and dropped, or the constant is simply stale. |
| 10 | **`index.html:5076` `× 0.08`** | The dangerous-goods percentage is an unnamed literal inside `feeAmountByCode`, and is the only fee component not exposed in the settings modal — inconsistent with its own configurable minimum. |
| 11 | **`index.html:5205` vs `5241` in `getProductSummary`** | `discount` is computed twice from `p.carrierId`: once at the top (before the carrier may be reassigned at line 5227) into a local that is never used, and again in the return object. The unused local is dead; whether the duplication was intentional is unclear. |
| 12 | **`p.weightSource`** | Collected, persisted and rendered, but no calculation or export ever reads it. |
| 13 | **`env.OWNER_ID`** | Loaded into config, referenced nowhere. There is no authorisation check of any kind in the bot. |
| 14 | **`state.restrictionFeeConfig` and `state.commissionConfig`** | Business configuration stored in **localStorage per browser**. Two operators on two machines will produce different totals for the same order. Whether this is intended is not stated anywhere. |
| 15 | **`shipping_rates.weight` unit** | The system treats it as pounds everywhere, but nothing in the schema, a constraint, or a column comment records that. A kg-based provider added later would silently corrupt every price. |
| 16 | **Third currencies in `shipping_rates.currency`** | `lookupShipping` and `convertToSar` both convert only `'USD'` and pass everything else through as SAR. A `EUR` or `GBP` rate row would be silently mispriced. The validator permits any `[A-Z]{3}`. |
| 17 | **`carriers.id = 3`** | Left without a `code` in `sql/004` with the comment "existing generic FedEx row… unused by the scraper going forward". Whether it still holds rate rows is unknown from source. |
| 18 | **Duplicated `USD_TO_SAR = 3.75`** | Defined independently in `index.html:4580` and `shipping.calculator.ts:32`. Nothing keeps them in sync; there is no note about who owns the canonical value. |
| 19 | **Bot session persistence** | grammY's default in-memory session store is used. A restart loses every in-progress quote. No comment states whether this is accepted. |
| 20 | **`telegram-bot/.gitignore`** | Empty (0 bytes) while `.env` in the same directory contains a live bot token and a service-role JWT. |

# Parcel Lab

A progressively rendered, reactive shipping calculator built with eXact server components.

## Run locally

```sh
npm run dev:shipping
```

Open `http://localhost:4175`. The deterministic fictional DOOP carrier works without environment
configuration. Copy `.env.example` to an untracked `.env` to enable supported live carriers. The
development server installs the eXact Vite integration, so the Chromium DevTools extension can
inspect the live component tree without additional configuration.

## Build and test

```sh
npm run build:shipping
npm run start:shipping
npm run test:shipping
```

The retained-heap stress test is intentionally opt-in because it repeatedly renders the
compiler-generated hydratable SSR root with production marker behavior, forces garbage
collection across 1,000 measured requests, and verifies after every batch that no component
instances or effect scopes survive:

```sh
npm run test:heap -w @exactjs/sample-shipping-calculator
```

Transient allocation volume has a separate opt-in sampling guard:

```sh
npm run test:allocation -w @exactjs/sample-shipping-calculator
```

Provider configuration is captured once for each environment object. Quote results use a
five-minute LRU cache bounded by both 256 entries and 2 MiB; `quoteCacheMetrics()` exposes
value-only occupancy, hit, miss, expiration, and eviction counters for diagnostics.

## What it demonstrates

Parcel Lab combines client-owned form state, route calculation, parallel carrier tasks,
progressive results, cancellation, generated server operations, and server-only provider modules.
Real-provider credentials and OAuth tokens remain on the server.

The app compares rates only; it does not buy labels or generate tracking numbers. Review each
carrier's current API and display terms before operating a public comparison service.

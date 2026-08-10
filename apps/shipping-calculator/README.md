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

## What it demonstrates

Parcel Lab combines client-owned form state, route calculation, parallel carrier tasks,
progressive results, cancellation, generated server operations, and server-only provider modules.
Real-provider credentials and OAuth tokens remain on the server.

The app compares rates only; it does not buy labels or generate tracking numbers. Review each
carrier's current API and display terms before operating a public comparison service.

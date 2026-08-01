# Trusted microfrontend portal

A sample portal composed from independently built page, branding, and billing eXact roots.

## Run locally

```sh
npm run dev:microfrontends
```

Open `http://localhost:4300`. The browser loads the branding and billing artifacts separately,
while server work travels through the page application's public eXact endpoint to private remote
hosts.

## What to explore

- Shared page-owned context across remote roots
- Remote-local component state and lifecycle
- Page-owned children rendered through a remote shell
- Nested and late-mounted roots
- Multiple remote exposures and failure fallbacks
- Server operation routing through an authenticated page gateway

## Production-shaped build

```sh
npm run build:microfrontends
npm run start:microfrontends
```

See [microfrontends](../../docs/microfrontends.md) for the architecture and trust model.

# Nuxt controlled-service participant

This participant implements Signal Desk with Nuxt SSR, hydration, Vue reactivity, and the controlled
JSON/SSE service. It owns its UI and transport code independently and runs through the complete shared
browser contract before measurement.

The Node production build uses Nitro's `node-listener` preset, hosted by the comparison harness.
Bun builds use the native `bun` preset in a separate output directory.

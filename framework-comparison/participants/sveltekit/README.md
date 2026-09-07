# SvelteKit controlled-service participant

This participant implements Signal Desk with SvelteKit SSR, hydration, component-local state, and the
controlled JSON/SSE service. Its application code and transport ownership are independent of the other
participants. Run it through the comparison workspace commands so correctness gates every measurement.

Use `npm run build:sveltekit` in the comparison workspace for Node output and `npm run build:bun`
for native Bun output. The Bun build uses `svelte-adapter-bun` with the existing SvelteKit 2
application; the official Bun adapter currently requires SvelteKit 3 prerelease.

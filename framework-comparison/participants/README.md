# Participant applications

Each child directory owns one framework implementation. It must contain a `participant.json`, its dependency
lockfile, source, tests, and a short README explaining framework-specific choices. Do not import UI or state
code from another participant.

Copy [`participant.example.json`](participant.example.json) when beginning an implementation. Every measured
participant must pass the shared contract, and framework and adapter versions must be exact so a result can
be reproduced.

The controlled-service participants are:

- [`exact`](exact), using durable component state and compiler-observed DOM expressions;
- [`react`](react), using React 19 state, effects, and memoized callbacks;
- [`sveltekit`](sveltekit), using Svelte 5 and SvelteKit SSR;
- [`nuxt`](nuxt), using Vue 3 and Nuxt SSR; and
- [`tanstack-start`](tanstack-start), using TanStack Router loaders and TanStack Start SSR.

The native-full-stack participants are:

- [`exact-native`](exact-native), using compiler-generated server tasks, progressive SSR, hydration, and
  server-owned event streaming; and
- [`react-native`](react-native), using React Router loaders, actions, revalidation, resource routes, and
  streaming SSR.

Participants intentionally duplicate presentation and framework integration code. This keeps authored
complexity and ownership visible instead of hiding differences behind a benchmark-specific abstraction.

Implement both tracks in separate entry points when practical. If a framework cannot support a track, record
that limitation rather than emulating a feature through another participant's architecture.

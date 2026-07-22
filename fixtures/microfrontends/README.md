# Microfrontend integration fixtures

These three applications exercise the initial Vite/Rollup vertical slice of the
trusted same-organization microfrontend architecture:

- `page-host` owns the public page, publishes provided package instances, and
  configures browser entries separately from private `__exact` endpoints.
- `billing-host` exposes an independently built remote area with a lazy chunk,
  stylesheet, font, and image.
- `branding-host` exposes a shell that renders page-owned VNodes supplied as
  ordinary named props.

The fixture build test lives with `@exact/vite-plugin`. Runtime protocol,
cross-root ownership, gateway, and replacement behavior are covered by the
focused framework integration suites.

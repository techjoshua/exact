# Rust SSR load driver

This private Apache-2.0 tool, copyright Joshua Friesen, supplies independent HTTP load for the
framework comparison. Use it to check whether Node driver CPU, allocation or scheduling limits
offered demand. It uses a single Tokio event-loop thread, a reusable HTTP connection pool and
per-slot response buffers. A Rust driver can still allocate and compete with the target for CPU.

Install Rust 1.99.0 and a platform C linker, then build from the repository root before entering
the benchmark network namespace:

```sh
npm run build:load-driver -w @exactjs/framework-comparison-suite
```

The binary and build cache live under `.tmp/rust-load-driver-target`. Cargo dependencies are
pinned by this directory's `Cargo.lock`. Source, lockfile and toolchain identify a rebuild. Each
capture also records the executed binary's SHA-256.

Run the shared contract tests with `npm run test:load-driver -w @exactjs/framework-comparison-suite`.
Use `COMPARISON_LOAD_DRIVER=rust` with the existing capacity, arrivals or sustained-load collector.
Node remains the default. `COMPARISON_RUST_DRIVER` selects an explicitly built binary at another path.
For an independent driver, use:

```sh
node framework-comparison/src/run-rust-ssr-load.mjs plan.json result.json
```

The driver uses the existing JSON plan, complete-body identity check, warmup exclusion, bounded
histograms, absolute request deadline and demand accounting. Arrival scheduling never waits for
responses. Late, capacity-limited and unissued arrivals remain separate from request failures.
Stdin belongs to the coordinator. EOF or termination cancels pending work and closes connections.

This version supports HTTP/1.1 over plain HTTP. It rejects HTTPS and URL credentials. It does not
follow redirects, use environment proxies, automatically decompress bodies or retry requests.
CPU telemetry is available on Unix. Other platforms report it as unavailable. Node event-loop
and GC metrics are unavailable in Rust captures. Transport errors use Rust-specific categories,
while timeout, body-limit, status and identity failures retain the shared categories.

See [load-testing methodology](../../docs/ssr-load-testing.md) for network isolation, calibration,
report admission and interpretation. This tool is internal and is not an application-authoring package.

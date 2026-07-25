# Framework plugins

Status: implemented.

eXact framework plugins add cross-cutting behavior to compiler, server,
rendering, client, and testing hosts through one validated package protocol.
The implementation is divided between:

- `@exactjs/plugin-api`, which owns browser-safe public contracts and manifest
  helpers;
- `@exactjs/config`, which owns `exact.config.ts` loading and typed
  configuration;
- `@exactjs/plugin-host`, which owns Node-side discovery, trust, version
  selection, graph ordering, projections, lifecycle, and cleanup; and
- the compiler and host adapters, which consume prepared projections without
  reimplementing discovery.

`@exactjs/secrets` and `@exactjs/microfrontends` exercise the protocol as
official plugins.

## Discovery and trust

The host supports `root`, `trusted`, and `all` discovery modes. `trusted` is
the default and initially trusts packages in the `@exactjs/` scope. Package
ignores, required dependencies, supported host capabilities, and version
ranges are validated before plugin code participates.

Trusted plugin code executes in-process. Discovery is a supply-chain policy,
not a JavaScript sandbox. Applications should not trust a plugin package they
would not trust as build or server code.

Only one implementation of a canonical plugin may execute. When several
dependency branches expose candidates, the host selects a deterministic
compatible version or fails with provenance explaining the conflict.

## Configuration

`exact.config.ts` is the canonical application configuration. Plugins augment
its TypeScript shape and can contribute defaults or transformations through
the dependency graph.

Configuration order is deterministic:

1. plugin defaults;
2. dependency leaves before their consumers;
3. alphabetic order between ready peers; and
4. the application root last.

A transform that returns `undefined` retains the current configuration. A
returned value replaces it. Configuration may be asynchronous. Final
validation runs after every transform and before any host output is accepted.

Server-only configuration is projected only into hosts that need it. It must
not appear in client projections, generated client code, hydration data,
diagnostics, logs, or profile attributes.

## Host projections and lifecycle

A prepared registry can expose separate compiler, server, render, client, and
testing projections. Hosts run the shared lifecycle contracts rather than
inventing plugin-specific hooks.

Application and request resources are disposed in reverse acquisition order.
Cancellation and cleanup belong to the host scope that created the resource.
Build adapters invalidate prepared registries when configuration, plugin
manifests, or discovered package inputs change.

Output processing follows a strict boundary:

1. plugins may transform an output;
2. all final validators run;
3. validation failure prevents publication; and
4. no plugin may mutate the output after final validation.

## Authoring guidance

Use `@exactjs/plugin-api` for shared contracts and manifest construction. Use
`@exactjs/plugin-host/node` only in filesystem-backed hosts. Keep manifests
deterministic and JSON-safe, declare capabilities and ordering explicitly, and
put host-specific behavior in the appropriate projection.

An application feature that can be expressed as a component, context, or
ordinary task should remain application code. A framework plugin is warranted
when the behavior must participate consistently in several compiler/runtime
hosts or enforce a cross-cutting boundary.

## Current limitations

- Vite has the most complete automatic integration.
- Webpack and Bun use the shared contracts but individual plugins may expose a
  narrower host-specific feature set. Check the plugin and runtime docs.
- The current compiler planning manifest can carry validated plugin metadata;
  the proposal to remove manifest files will replace that transport rather
  than remove plugin validation.

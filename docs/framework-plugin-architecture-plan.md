# Framework Plugin Architecture Plan

## Status

This document is the decision-complete plan for a general eXact framework
plugin system. `@exactjs/secrets` is its runtime/provider conformance consumer,
while generic residency, secret flow, package grants, and policy auditing live
in the core compiler. The protocol must support future compiler, server,
rendering, client, and testing plugins without adding plugin-specific hooks to
each host.

The design treats activated plugin packages and configuration contributors as trusted in-process code. Trust and ignore policy decide whether a package participates. Once accepted, a package may use the complete public plugin API and may contribute configuration to any active plugin.

## Goals

- Discover and register plugins consistently across the compiler CLI, Vite, Webpack, Bun, artifact builds, SSR, server runtime, hydration, and testing.
- Allow reusable application frameworks to forward plugins without requiring every consuming application to register them again.
- Allow trusted participating packages to provide opinionated defaults for any active plugin.
- Give plugins a typed configuration property in one canonical `exact.config.ts`.
- Support compiler extensions and runtime lifecycle extensions through stable, versioned APIs.
- Select and execute one implementation of each canonical plugin package.
- Produce deterministic configuration and registry results from dependency graphs that may contain branches and diamonds.
- Fail closed when a required or security-critical plugin cannot be loaded, configured, validated, or enforced.
- Keep server-only plugin configuration and resources out of client artifacts and serialized data.

## Non-Goals

- Sandboxing activated plugins or configuration functions.
- Restricting a trusted package to configuring only plugins beneath its forwarding path.
- Adding separate authorization protocols for plugin integrations.
- Treating configuration ordering as a security boundary.
- Automatically serializing raw plugin configuration into manifests, hydration data, or client bundles.

## Packages

### `@exactjs/plugin-api`

A lightweight, runtime-minimal protocol package containing:

- Plugin and forwarding manifest schema constants.
- Compiler and runtime extension interfaces.
- Configuration transform and controller types.
- Host capability identifiers.
- Diagnostic and manifest contribution types.
- Package metadata parsing and validation helpers.
- Authoring helpers used by plugin and framework package tests.

Every plugin and every package participating in forwarding or plugin configuration must directly declare a compatible `@exactjs/plugin-api` dependency or optional dependency. Peer dependency alone is not sufficient for the participation marker.

### `@exactjs/config`

Owns the canonical application configuration types and loader-facing helpers:

```ts
export interface ExactPluginConfigRegistry {}

export type ExactPluginConfigTransform<T> = (
	config: T,
	context: ExactPluginConfigContext
) => T | undefined | Promise<T | undefined>;

export interface ExactConfig {
	pluginDiscovery?: ExactPluginDiscoveryConfig;
	plugins?: {
		[K in keyof ExactPluginConfigRegistry]?:
			| ExactPluginConfigTransform<ExactPluginConfigRegistry[K]>
			| false;
	};
}

export function defineConfig(config: ExactConfig): ExactConfig;
```

The canonical application file is `exact.config.ts`. Official hosts also accept an explicit config path.

### Shared plugin host

A shared host package or internal package owns:

- Application-root and config-file resolution.
- Installed dependency graph loading.
- Trust and ignore evaluation.
- Plugin forwarding traversal.
- Singleton plugin version selection.
- Deterministic configuration execution.
- Plugin entry loading and capability negotiation.
- Generated configuration type references.
- Registry fingerprinting, reports, caching, and invalidation.

Vite, Webpack, Bun, CLI, SSR, server, hydration, and testing consume this shared host instead of implementing discovery independently.

## Canonical Configuration

Example:

```ts
import { defineConfig } from '@exactjs/config';
import { environmentSecrets } from '@exactjs/secrets/providers';

export default defineConfig({
	pluginDiscovery: {
		mode: 'trusted',
		trustedPrefixes: ['@exactjs/', '@acme/'],
		ignore: ['@acme/unused-framework']
	},
	plugins: {
		secrets: async (config) => {
			config.providers.push(environmentSecrets());
			config.required.push('DATABASE_URL');
			return undefined;
		}
	}
});
```

The root application plugin entry is the same transform type used by framework packages. It runs last.

Returning exactly `undefined`, including through `Promise<undefined>`, retains the current possibly mutated object. Returning `T`, including through `Promise<T>`, replaces it:

```ts
const result = await transform(current, context);
if (result !== undefined) current = result;
```

The type intentionally uses `undefined`, not `void`:

```ts
T | undefined | Promise<T | undefined>;
```

This prevents unrelated return types from being erased by TypeScript's permissive `void` assignability. `null` is a replacement value and fails validation unless it is valid for the plugin configuration type.

## Discovery Modes

```ts
export type ExactPluginDiscoveryConfig =
	| {
			mode?: 'root';
			ignore?: readonly string[];
	  }
	| {
			mode: 'trusted';
			trustedPackages?: readonly string[];
			trustedPrefixes?: readonly string[];
			includeDefaultTrustedPrefixes?: boolean;
			ignore?: readonly string[];
	  }
	| {
			mode: 'all';
			ignore?: readonly string[];
	  };
```

Omitting `pluginDiscovery` selects `trusted` mode with the default trusted prefix `@exactjs/`.

Package match entries are either:

- An exact package name, such as `@acme/framework`.
- A prefix ending in `/`, such as `@acme/`.

### `root`

- Activate valid plugins directly declared by the application root.
- Do not traverse forwarding declarations.
- Allow trusted root application configuration for active plugins.
- Apply the root `ignore` list before activation.

### `trusted`

A package participates when:

1. It is a direct dependency of the application root or its canonical package name matches `trustedPackages` or `trustedPrefixes`.
2. It is directly declared by the application or explicitly forwarded by a participating trusted package.
3. It is not ignored.
4. Its participation metadata and `@exactjs/plugin-api` version are valid.

The application root is inherently trusted.

Both a forwarding parent and its forwarded child must satisfy these rules. A trusted parent cannot make an otherwise untrusted child participate.

### `all`

- Traverse every valid explicit forwarding edge regardless of package prefix or exact-name trust.
- Continue requiring valid marker dependencies, metadata, declared dependency relationships, public entry exports, and protocol compatibility.
- Continue applying ignore rules.
- Emit a supply-chain warning unless the host explicitly suppresses that warning.

`all` does not activate arbitrary packages merely because they are reachable. Plugin activation and forwarding remain explicit.

## One Ignore Concept

There is one package ignore mechanism, not separate package, plugin, or configuration ignore lists.

The root declares it in `pluginDiscovery.ignore`. A participating package may declare the same `ignore` list in its forwarding metadata for its own outgoing traversal.

Ignoring package `P` means:

- Do not activate `P` as a plugin.
- Do not load or execute any plugin-system exports from `P`.
- Do not traverse forwarding edges originating at `P`.
- Do not execute configuration transforms contributed by `P`.
- Do not generate configuration type references or manifest metadata from `P`.
- Do not automatically remove another accepted path to the same descendants.

The root ignore list applies to the whole application graph. A node-local ignore prunes the matching package from traversal through that node.

If an accepted branch marks an ignored package as required, registry construction fails and reports the requirement and ignore chains. A node cannot both include and ignore the same direct child.

## Plugin Package Metadata

Example:

```json
{
	"name": "@exactjs/secrets",
	"dependencies": {
		"@exactjs/plugin-api": "^1.0.0"
	},
	"exact": {
		"plugin": {
			"schemaVersion": 1,
			"protocolVersion": "1.0.0",
			"configKey": "secrets",
			"entries": {
				"config": "./plugin-config",
				"configTypes": "./config",
				"compiler": "./compiler",
				"server": "./server",
				"render": "./render",
				"client": "./client",
				"testing": "./testing"
			}
		}
	}
}
```

Rules:

- Package name is the canonical plugin identity.
- `configKey` must be unique in the application registry.
- Entry values are public package export subpaths.
- Absolute paths, path traversal, unexported files, and ambiguous conditions are rejected.
- Entries are optional; a compiler-only or server-only plugin does not need empty stubs.
- Entry modules declare the plugin API and host capability versions they require.
- Client entries and client configuration projections are opt-in.

## Forwarding And Configuration Metadata

Example application framework:

```json
{
	"name": "@acme/app-framework",
	"dependencies": {
		"@exactjs/plugin-api": "^1.0.0",
		"@exactjs/secrets": "^1.0.0"
	},
	"exact": {
		"pluginForwarding": {
			"schemaVersion": 1,
			"include": {
				"@exactjs/secrets": {
					"required": true
				}
			},
			"ignore": []
		},
		"pluginConfiguration": {
			"@exactjs/secrets": {
				"version": "^1.0.0",
				"subpath": "./exact",
				"export": "configureSecrets"
			}
		}
	}
}
```

Forwarded children must be declared in the parent's `dependencies`, `optionalDependencies`, or `peerDependencies`:

- Missing required dependencies or peers fail discovery.
- Missing optional dependencies skip that forwarding edge.
- Every forwarding participant must directly depend on a compatible `@exactjs/plugin-api`.

Any trusted participating package may declare one configuration transform for any active plugin. It does not need to forward, depend on, or declare a separate integration relationship with the target plugin.

Configuration contribution validation is intentionally limited to consistency:

- Contributor participates and is not ignored.
- Target plugin is active.
- Optional target version constraint matches the selected implementation.
- Transform is a public export of the contributing package.
- Contributor declares at most one transform for that target plugin.
- Transform result and final configuration pass plugin validation.

Activated packages and their configuration code are trusted in-process code. Additional configuration-authority rules would not provide meaningful isolation.

## Singleton Plugin Resolution

Only one implementation of a canonical plugin package executes in an application registry.

Resolution:

1. Build the explicit accepted forwarding graph.
2. Apply root and node-local ignores.
3. Remove pruned branches from plugin requirements and configuration contributions.
4. Collect all remaining version requirements for each canonical plugin package.
5. Find installed candidates satisfying every accepted requirement.
6. Select one candidate deterministically.
7. Execute its defaults, extensions, and lifecycle once.

Selection preference:

1. The application root's normal package resolution when it satisfies all requirements.
2. Otherwise, the highest installed semantic version satisfying all requirements.
3. If identical versions exist at multiple real paths, prefer the shortest dependency distance from the root, then normalized real path.

If no single candidate satisfies all accepted requirements, registry construction fails with every contributing range and forwarding path. Applications or frameworks resolve the conflict by changing dependency versions or applying the same package ignore mechanism to an optional conflicting branch.

Required branches cannot be silently pruned to resolve conflicts.

## Typed Configuration Augmentation

Plugins augment the shared registry:

```ts
declare module '@exactjs/config' {
	interface ExactPluginConfigRegistry {
		secrets: SecretsPluginConfig;
	}
}
```

Discovery atomically generates `.exact/plugins.d.ts`:

```ts
/// <reference types="@exactjs/secrets/config" />
```

Rules:

- Applications include `.exact/**/*`, matching existing artifact conventions.
- Add `exact plugins sync` for explicit setup and CI use.
- Every official host synchronizes the file before compilation and watches discovery inputs.
- First-run generation happens before the host invokes TypeScript compilation.
- Removed or ignored plugins remove their references.
- Type reference ordering is canonical plugin package-name order.

## Plugin Configuration Controller

The plugin config entry exports a controller:

```ts
export interface ExactPluginConfigController<T> {
	defaults(context: ExactPluginConfigContext): T | Promise<T>;
	validate(config: T, context: ExactPluginConfigContext): undefined | Promise<undefined>;
	compilerConfig?(
		config: T,
		context: ExactPluginConfigContext
	): ExactCompilerPluginConfig | Promise<ExactCompilerPluginConfig>;
	serverConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
	clientConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
	testingConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
}
```

Configuration validation occurs in two stages:

- Structural validation after every replacement return, before passing it to the next transform.
- Final plugin validation after all transforms and before host projections.

Mutation-only transforms are finally validated after the transform completes. Plugins may optionally expose a lightweight structural validator for per-stage mutation checks.

Raw resolved configuration is held only by the plugin registry host. Hosts receive explicit projections:

- Compiler receives compiler-safe configuration plus a JSON-safe cache key.
- Server receives server configuration and provider factories.
- Client receives nothing unless `clientConfig` exists.
- Testing receives an explicit test projection.

Projection functions must not be used to serialize arbitrary server configuration into artifacts.

## Deterministic Configuration Pipeline

Configuration is resolved independently for each active plugin.

### Contributor graph

The contributor graph contains every accepted participating package that declares a transform for the target plugin, plus the application root if it configures the plugin.

Ordering edges are derived from the accepted package forwarding/dependency graph. Dependency leaves execute before their ancestors. A shared package node is represented once even when reachable through multiple paths.

### Execution algorithm

1. Call the selected plugin's `defaults()` once.
2. Identify contributing nodes whose contributing descendants are complete.
3. Sort ready nodes by canonical package name.
4. Execute ready transforms sequentially.
5. Await each result.
6. Retain the current configuration when the result is exactly `undefined`.
7. Replace the current configuration when the result is `T`.
8. Mark the contributor complete and repeat.
9. Execute the root application transform last.
10. Run final plugin validation.
11. Produce host-specific projections.

This is a deterministic reverse-topological reduction. A diamond node executes once. Cycles fail registry construction.

Packages without an ancestry relationship become ready together and use canonical package-name ordering.

### Transform context

Each transform receives:

- Target plugin identity and selected version.
- Contributing package identity and version.
- Application root.
- Environment name and host mode.
- Abort signal.
- Execution index.
- Read-only provenance describing why both packages participate.

Transforms may be asynchronous and may perform I/O. Registry preparation has an overall timeout and abort signal. A missing export, thrown error, rejected promise, timeout, invalid replacement, or validation error aborts registry construction.

Reports record transform identity, ordering, duration, and outcome but never configuration values.

## Plugin Registry And Fingerprint

The shared host prepares one immutable registry per:

- Canonical application root.
- Config file and environment.
- Host mode.
- Installed dependency graph.
- Accepted trust/ignore policy.
- Selected plugin implementations.
- Configuration and extension inputs.

The registry exposes prepared compiler, server, render, client, and testing extensions.

The stable fingerprint includes:

- Canonical plugin names and exact versions.
- Plugin protocol and requested host capabilities.
- Compiler entry identities.
- Plugin-provided compiler configuration cache keys.
- Accepted configuration contributor identities and exported transform identities.

The fingerprint excludes raw configuration values, providers, credentials, and server-only objects.

Plugin config controllers must provide a safe JSON-compatible compiler cache key whenever their compiler projection can change emitted artifacts. The host does not stringify arbitrary plugin configuration.

## Compiler Extension API

The compiler owns:

- Parsing and canonical binding identity.
- Type, call, state-path, alias, and context analysis.
- Reactive provenance.
- Placement inference.
- VNode and output-sink enumeration.
- Artifact generation.
- Source locations and diagnostics.

Versioned plugin hooks may contribute:

- Namespaced directives and validation.
- Type qualifications.
- Semantic and value-flow policies.
- Placement effects.
- Reactive provenance rules.
- VNode and client-boundary checks.
- Serialization checks.
- Artifact contributions.
- Namespaced manifest data.
- Diagnostics and audit information.

Plugins receive immutable compiler views and return bounded contributions. They cannot mutate compiler internals or another plugin's namespace.

Registry preparation may be asynchronous, but per-module compiler hooks are synchronous.

Plugin directives are namespaced:

```ts
/** @exact localization.message */
/** @exact telemetry.span */
```

Unknown namespaced directives fail compilation even when no matching plugin is installed.

Secret residency uses the core `keep=secret` directive for custom declaration
contracts. Standard secret sources carry that policy through `Secret<T>`.
Consumption uses the compiler-recognized `consume()` function exported by
`@exactjs/secrets`, not an annotation or namespaced plugin directive. The secrets
package therefore does not install a compiler extension or define source/sink
annotations.

Security plugins must be able to request analysis of plain `.ts`, `.js`, and declaration files, not only JSX files. Official bundler hosts use registered candidate filters and the shared expression project so plugin analysis cannot be bypassed by moving a declaration out of a JSX-containing module.

Low-level compiler APIs without a prepared registry fail when encountering plugin directives or manifests requiring unavailable plugins.

## Manifest Integration

Introduce a new compiler manifest version with:

```json
{
	"pluginRegistry": {
		"fingerprint": "...",
		"plugins": {
			"@exactjs/secrets": {
				"version": "1.0.0",
				"protocolVersion": "1.0.0",
				"required": true,
				"compilerConfigKey": "..."
			}
		}
	},
	"pluginData": {
		"@exactjs/secrets": {}
	}
}
```

Rules:

- Core validates the envelope, registry fingerprint, JSON safety, and depth/node/byte limits.
- Each plugin validates its namespaced payload.
- Plugins cannot write another plugin's namespace.
- Required plugin data cannot be ignored by a consuming host.
- Client and server artifacts must have compatible registry fingerprints.
- Combining imported manifests with incompatible required plugin protocols fails.
- Server-only plugin data is never copied into hydration configuration.
- Only plugins with client entries may contribute client metadata or dependencies.

## Runtime And Rendering Extensions

Runtime hooks cover:

- Common and host-specific configuration validation.
- Server startup.
- Application-scope initialization and reverse-order disposal.
- Request-scope initialization and reverse-order disposal.
- Action and refresh dispatch.
- Boundary rendering.
- Logging and error redaction.
- Hydration/client initialization.
- Testing setup and teardown.

Output processing uses fixed phases:

```text
core/plugin production
→ registered output transformations
→ all final policy validators
→ core serialization or emission
```

No plugin may mutate an output after final validators run. Validators all execute; one validator cannot short-circuit the remaining validators. A validation failure prevents serialization or emission.

Server startup completes required plugin validation and application initialization before accepting requests. Client-only builds do not fail because a server provider is absent; server-specific validation runs only in server hosts.

## Host Integration

Use the same prepared registry in:

- `exactc` and direct project/artifact compilation.
- Vite, Webpack, and Bun integrations.
- SSR string, document, and progressive render paths.
- Server runtime creation and endpoint dispatch.
- Hydration registration and client initialization.
- Testing utilities.

Application-root resolution order:

1. Explicit host option.
2. Nearest `exact.config.*`.
3. Nearest package root.

The initial dependency graph implementation uses npm lockfile v2/v3 data with installed-tree fallback, reusing and generalizing the current React compatibility discovery machinery. Other package managers can add graph readers behind the same interface.

The React compatibility system may continue using its specialized adapter protocol initially, while sharing package graph, metadata validation, caching, and invalidation infrastructure.

## Failure And Security Rules

- Activated plugins and transforms are trusted in-process code; documentation must state this plainly.
- Ignored packages are never imported through the plugin system.
- Every forwarding edge remains explicit in every mode.
- `trusted` mode requires both parent and child participation trust.
- Executable entries resolve only through public package exports.
- Package identities are canonicalized through real paths and package names.
- Required plugin or transform failures are fatal; hosts never warn and continue without enforcement.
- Disabling or ignoring a required plugin fails with the complete requirement chain.
- All final output validators run after all transformations.
- Plugin manifest contributions and diagnostics have hard resource limits.
- Registry reports, fingerprints, errors, diagnostics, and source maps never contain raw configuration values.
- Server configuration entries and dependencies are excluded from client graphs.
- Partial application/request initialization disposes completed resources in reverse order.
- Client/server fingerprint mismatch fails before hydration or endpoint dispatch.
- Configuration and extension failures include plugin, contributor, export, and lifecycle phase without printing configuration contents.

## Cache And Invalidation Inputs

Invalidate registry/configuration/compiler caches when any of these change:

- `exact.config.*`.
- Root `package.json`.
- Lockfile or installed dependency graph.
- Plugin and forwarder `package.json` metadata.
- Selected plugin versions or export maps.
- Configuration transform modules.
- Plugin config controllers and host entries.
- Generated configuration declarations.
- Type declaration files that affect compiler policies.
- Trust or ignore policy.

Never cache a partially resolved or failed registry.

## Implementation Phases

### Phase 1: Shared graph and protocol packages

- Extract reusable package graph and metadata validation from React compatibility.
- Add `@exactjs/plugin-api` and `@exactjs/config`.
- Define strict plugin, forwarding, configuration, and capability schemas.

### Phase 2: Discovery and singleton registry

- Implement `root`, `trusted`, and `all`.
- Implement the unified root/node ignore concept.
- Implement forwarding validation, version selection, cycles, and reports.
- Add `exact plugins sync` and generated configuration type references.

### Phase 3: Configuration pipeline

- Load config controllers and trusted configuration exports.
- Implement async reverse-topological mutable transforms.
- Add replacement validation, root-last execution, host projections, timeout, cancellation, and provenance reporting.

### Phase 4: Compiler extensions

- Add prepared compiler-extension sets.
- Add namespaced directives and extension hooks.
- Expand host compilation coverage beyond JSX-only files.
- Add manifest plugin envelopes, fingerprints, and compiler cache keys.

### Phase 5: Runtime and rendering extensions

- Add startup, application, request, action, render, output, client, and testing hooks.
- Enforce transform-then-final-validation output ordering.
- Add reverse cleanup and host-specific configuration validation.

### Phase 6: Host integration

- Wire the shared registry into CLI, Vite, Webpack, Bun, artifact builds, SSR, server, hydration, and testing.
- Add common caching, watching, reporting, and mismatch errors.

### Phase 7: `@exactjs/secrets`

- Implement secrets as the runtime/provider conformance plugin.
- Use it to validate server provider configuration,
  rendering/serialization guards, scoped runtime resolution, audit events,
  client exclusion, and failure-closed behavior.
- Validate generic secret flow, manifests, grants, and aggregate reports in the
  core compiler suite rather than through a plugin-local analyzer.

## Test Plan

### Discovery and trust

- All three discovery modes.
- Default trusted behavior and replacement/extension of default prefixes.
- Direct, optional, peer, and recursive forwarding.
- Trusted/untrusted parents and children.
- Unified root and node-local ignores.
- Required ignored packages.
- Missing marker dependency and malformed metadata.
- Public export enforcement and path traversal rejection.

### Version selection

- One installed version.
- Multiple installed versions with one common compatible candidate.
- Deterministic candidate selection.
- No common compatible candidate with complete provenance.
- Conflict resolved by ignoring an optional branch.
- Required branch cannot be ignored.

### Configuration

- Plugin defaults execute once.
- Linear, branching, unrelated, and diamond contributor graphs.
- Deepest-first and alphabetical ready-node order.
- Shared contributor executes once.
- Trusted package configures an independently active plugin.
- Root transform executes last.
- In-place mutation returning `undefined`.
- Async mutation returning `Promise<undefined>`.
- Synchronous and asynchronous replacement.
- Accidental unrelated return type fails TypeScript.
- `null`, malformed replacement, rejection, timeout, cancellation, and final validation failures.
- Configuration values absent from reports and errors.

### Compiler and manifests

- Directive registration and unknown directive failure.
- Plain TypeScript and declaration-file analysis.
- Extension ordering and namespace isolation.
- Bounded malformed contributions.
- Low-level compilation without a required registry.
- Manifest plugin payload validation.
- Imported manifest protocol and fingerprint conflicts.

### Runtime and output

- Common versus host-specific startup validation.
- Server-required configuration does not fail client-only builds.
- Application/request concurrency and reverse cleanup.
- Every output transform precedes every validator.
- Validators all execute and no mutation follows validation.
- Server config and dependencies absent from client bundles, hydration, source maps, diagnostics, and logs.
- Client/server fingerprint mismatch before hydration and dispatch.

### Integration

- Identical registry across CLI and all bundler hosts.
- Config/type regeneration and HMR invalidation.
- Reusable frameworks forwarding and configuring `@exactjs/secrets`.
- Two independent plugins configuring one another while both are active.
- Plugin-free applications retain current behavior.

## Defaults And Settled Decisions

- Canonical config is `exact.config.ts`.
- Default discovery mode is `trusted`.
- `@exactjs/` is the initial default trusted prefix.
- There is one package ignore concept.
- Any trusted participating package may configure any active plugin.
- There is no forwarding-subtree configuration restriction or separate integration protocol.
- One implementation of each canonical plugin executes.
- Configuration transforms may be asynchronous and mutable.
- The transform type uses `undefined`, not `void`.
- `undefined` and `Promise<undefined>` retain the current configuration.
- A returned `T` replaces the current configuration.
- Plugin defaults run first, dependency leaves before ancestors, ready packages alphabetically, and root config last.
- Plugin code executes in-process and is not sandboxed.
- Output mutation finishes before final policy validation.
- Existing plugin-free applications preserve current behavior.

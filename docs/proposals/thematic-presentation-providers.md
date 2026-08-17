# Thematic presentation providers

## Status

Proposed. This document extends the implemented `exact-theme/1` semantic contract; it does not
replace that contract or describe shipped API.

The first implementation should prove the contract with the existing eXact recipes and a Tailwind
adapter. Bootstrap should be the second independent adapter used to expose assumptions accidentally
specific to atomic utilities.

## Decision summary

eXact should let component libraries continue to author provider-neutral theme meaning such as
`theme:action="primary"`, `theme:tone="danger"`, and `theme:surface="raised"`. The consuming
application may select a **thematic presentation provider** that translates that finite semantic
state into additive class names and typed style contributions.

Provider integration has two distinct halves:

1. a runtime-safe presenter maps one normalized semantic request to target contributions; and
2. a build manifest exposes the complete finite class vocabulary and required stylesheet inputs to
   Tailwind, Bootstrap, or another configured CSS build.

The current `@exactjs/theme` resolver remains the portable source of generated palette, contrast,
spacing, shape, depth, typography, and motion values. A provider can consume those values, replace
selected presentation recipes, or own a finite external theme, but it cannot change component
behavior, semantic meaning, native state, enhancement ownership, or authorization.

The application selects exactly one provider for a theme scope. Provider fallback is explicit:
omitting configuration selects the built-in eXact provider; selecting a missing or incompatible
provider is a build error.

## Why this boundary

Portable component libraries need to retain useful information without choosing the application's
CSS ecosystem. A button can truthfully say that it is a primary danger action, but it should not
have to decide whether that means eXact recipe selectors, Tailwind utilities, Bootstrap
`.btn-danger`, or an organization's generated classes.

Tailwind is a build-time class detector and CSS generator, not a runtime style lookup service. Its
documentation requires complete class tokens to be statically detectable and provides
`@source inline()` for candidates that do not occur literally in application source. Dynamic class
fragments such as `bg-${tone}-500` are therefore not a valid integration contract. Bootstrap ships
a finite class and CSS-variable vocabulary and exposes a Sass utility API for generating or
customizing that vocabulary. Bootstrap color modes are selected through scoped data attributes or
media queries. These systems can share a semantic input, but they require different build adapters.

References:

- [Tailwind class detection and `@source inline()`](https://tailwindcss.com/docs/detecting-classes-in-source-files)
- [Bootstrap utility API](https://getbootstrap.com/docs/5.3/utilities/api/)
- [Bootstrap color modes](https://getbootstrap.com/docs/5.3/customize/color-modes/)
- [Bootstrap CSS variables](https://getbootstrap.com/docs/5.3/customize/css-variables/)

## Goals

- Keep semantic theme annotations portable across component libraries and applications.
- Allow local, deterministic providers to return class names or typed style values.
- Give class-generating tools a complete, finite candidate manifest before their build runs.
- Preserve authored classes, styles, semantic HTML, native states, and enhancement composition.
- Preserve precise eXact updates: changing one role input updates only that target; changing a
  scope source republishes the scope and lets CSS cascade update descendants.
- Produce identical SSR and client contributions and deterministic hydration output.
- Preserve the existing arbitrary-color and contrast-corrected generative theme through a hybrid
  class-plus-variable mode.
- Keep providers inspectable in DevTools by exposing their identity, request, contribution, and
  build fingerprint.
- Make unsupported semantic combinations explicit diagnostics rather than silent visual drift.

## Non-goals

- Making Tailwind or Bootstrap a required dependency of `@exactjs/theme` or eXact applications.
- Treating JSX class names as the portable component-library contract.
- Loading a CSS framework, invoking a network service, or evaluating project configuration in the
  browser.
- Reimplementing Bootstrap JavaScript widgets or giving a provider ownership of behavior.
- Allowing providers to replace event handlers, refs, accessibility attributes, children, keys,
  component identity, or lifecycle.
- Translating arbitrary authored CSS into another framework.
- Guaranteeing that every external framework has a lossless representation of every eXact theme
  axis.
- Generating an unbounded class set from runtime strings.

## Terminology

- **semantic request**: normalized provider-neutral theme meaning for one target;
- **presentation contribution**: validated classes and style values added to that target;
- **scope publication**: classes, provider-owned data attributes, and variables placed on a theme
  scope wrapper;
- **candidate manifest**: finite build-time list of every class token a provider may return;
- **coverage**: the set of semantic request fields a provider represents directly;
- **hybrid provider**: an adapter that uses external classes while retaining `exact-theme/1`
  variables for dynamic values or missing coverage.

## Architecture

```text
component library TSX
  theme:action="primary" theme:tone="danger"
                    |
                    v
compiler-normalized semantic request
                    |
          application-selected provider
          /                         \
build candidate manifest       runtime-safe presenter
          |                         |
Tailwind / Sass / CSS build     classes + typed styles
          \                         /
                    DOM / SSR target
```

This is intentionally not a provider call from the browser to Tailwind or Bootstrap. Provider code
is ordinary authorized package code bundled with the application. Build-tool adapters consume only
the provider's serializable manifest; they do not execute the browser presenter while scanning CSS.

## Public semantic request

The request is a discriminated union, not a string dictionary. It contains only visual semantics
already represented by the theme enhancement contract plus the minimum target facts needed for a
safe mapping.

```ts
export type ThemePresentationRequest =
	| ThemeSurfacePresentationRequest
	| ThemeActionPresentationRequest
	| ThemeFieldPresentationRequest
	| ThemeTextPresentationRequest
	| ThemeStatusPresentationRequest
	| ThemeSeparatorPresentationRequest
	| ThemeSelectionPresentationRequest;

export interface ThemePresentationRequestBase {
	readonly contract: 'exact-theme-presentation/1';
	readonly tone: ThemeTone;
	readonly size: 'small' | 'medium' | 'large';
	readonly target: ThemeTargetDescriptor;
}

export interface ThemeTargetDescriptor {
	readonly namespace: 'html' | 'svg' | 'mathml' | 'custom';
	readonly name?: string;
	readonly capabilities: readonly (
		| 'button'
		| 'editable'
		| 'select'
		| 'multiline'
		| 'selection'
		| 'landmark'
	)[];
}

export interface ThemeActionPresentationRequest extends ThemePresentationRequestBase {
	readonly role: 'action';
	readonly variant: 'primary' | 'secondary' | 'quiet';
	readonly dragging: boolean;
}
```

The remaining variants mirror the implemented finite values. Defaults are normalized before the
provider is called. The compiler derives target capabilities from the intrinsic or component-library
build facts; a provider does not infer behavior from tag-name strings. Unknown custom elements have
`namespace: 'custom'` and no capabilities unless their library publishes trusted static facts.

Native state such as `disabled`, `checked`, `selected`, `aria-current`, `aria-invalid`, hover,
focus, and active is deliberately absent. CSS selectors and variants continue to observe the live
DOM state. `dragging` and surface interaction remain present because they are authored application
state rather than a browser-owned pseudo-class.

## Provider contract

```ts
export interface ThematicPresentationProvider {
	readonly contract: 'exact-thematic-provider/1';
	readonly id: string;
	readonly version: string;
	readonly coverage: ThemeProviderCoverage;

	presentScope(request: ThemeScopePresentationRequest): ThemeScopeContribution;
	present(request: ThemePresentationRequest): ThemePresentationContribution;
}

export interface ThemePresentationContribution {
	readonly classes?: readonly ThemeClassToken[];
	readonly styles?: Readonly<Partial<Record<ThemePresentationProperty, string>>>;
	readonly diagnostics?: readonly ThemeProviderDiagnostic[];
}

export interface ThemeScopeContribution extends ThemePresentationContribution {
	readonly data?: Readonly<Record<`data-${string}`, string>>;
	readonly variables?: Readonly<Record<`--${string}`, string>>;
}
```

`defineThematicProvider()` validates and freezes a provider definition. Provider IDs use
package-owned identity such as `@exactjs/theme-tailwind/default`; the version is adapter behavior,
not npm resolution identity.

`ThemeClassToken` is a branded, validated single class token. Whitespace, control characters,
quotes, and empty tokens are rejected. `ThemePresentationProperty` is an explicit allowlist of
visual CSS properties needed by the baseline contract. It excludes generated content, URLs,
behavioral properties, and custom-property names. Scope variables are separately validated and may
use only the provider's declared prefix or `--exact-theme-` when it advertises that contract.

Only a scope may contribute data attributes, and only below a manifest-declared provider prefix
such as `data-bs-theme`. Element presentations cannot write arbitrary attributes. No provider API
accepts event handlers, refs, HTML, children, keys, or VNodes.

The contribution is additive:

1. authored class tokens retain authored order;
2. enhancement/provider tokens follow in stable provider order;
3. duplicate tokens are removed by first occurrence;
4. authored ordinary declarations and provider declarations are merged through the existing
   compiled-target style owner, with duplicate property ownership diagnosed;
5. scope variables remain scope-owned and are atomically replaced;
6. another enhancement cannot overwrite a provider contribution silently.

Provider output must be pure for its request and current resolved theme. Development builds call a
provider twice for sampled requests and diagnose nondeterministic output. Production caches by
provider fingerprint, resolved theme fingerprint, normalized request, and target descriptor.

## Provider selection and scope inheritance

Provider selection belongs to the consuming application because it owns the CSS build:

```ts
// exact.config.ts
import { defineConfig } from '@exactjs/config';
import { tailwindThematicProvider } from '@exactjs/theme-tailwind/config';

export default defineConfig({
	plugins: {
		theme: tailwindThematicProvider({
			mode: 'hybrid',
			stylesheet: './src/app.css'
		})
	}
});
```

`@exactjs/theme` should augment `ExactPluginConfigRegistry` with a `theme` entry. Its config
transform validates the provider manifest and supplies a serializable selection to compiler,
server, renderer, test, and language-tool contexts. Vite, Webpack, and Bun adapters receive the
same selection through normal plugin configuration rather than separate adapter options.

The configured provider is the root default. A nested theme inherits its parent's provider.
Switching providers inside one live scope is not supported in v1: it would require all candidate
CSS, produces hard-to-explain cascade conflicts, and offers little value over an explicit nested
scope. A later nested override must use a statically registered provider key so its candidates are
known at build time.

The default when no theme plugin is configured is the built-in eXact provider. An explicitly
configured provider that cannot be resolved, fails authorization, has an incompatible contract, or
lacks its required build integration fails the build. It must not silently fall back to a different
visual system.

## Build manifest

Each provider package publishes a side-effect-free JSON-compatible manifest through its
`exactThematicProvider` package field:

```ts
export interface ThemeProviderBuildManifest {
	readonly contract: 'exact-thematic-provider-build/1';
	readonly provider: { readonly id: string; readonly version: string };
	readonly classes: readonly string[];
	readonly stylesheets?: readonly ThemeProviderStylesheet[];
	readonly variables?: readonly `--${string}`[];
	readonly dataAttributes?: readonly `data-${string}`[];
	readonly coverage: ThemeProviderCoverage;
	readonly fingerprint: string;
}
```

The package manifest points to generated JSON, as component-library build facts do today. Build
adapters read it without executing application or provider code. Class tokens are sorted,
deduplicated, bounded, and checked against presenter output in package tests. The build rejects a
runtime class absent from the manifest.

The manifest declares inputs, not opaque shell commands. A stylesheet entry identifies a package
CSS file, generated candidate fragment, or external framework prerequisite. The consuming CSS tool
still owns its normal build and configuration. eXact reports an actionable error when, for example,
a Tailwind provider is selected but its candidate fragment is not included in the compiled CSS.

## Static and reactive lowering

When a request and provider selection are static, compilation should materialize its classes and
styles directly in the compiled target. No provider function ships for that target.

When role props are reactive, the compiler emits one narrowly reactive presentation expression.
The provider returns a frozen contribution selected from precomputed finite tables; it does not
rerender the component. Class reconciliation changes only provider-owned tokens and preserves
authored tokens and tokens owned by other enhancements.

Changing the root theme source behaves as it does now: `resolveTheme()` replaces one scope
publication and descendants restyle through CSS variables. The presenter is not called once per
descendant merely because a tonic, appearance, contrast, density, shape, depth, typography, or
motion value changed. A provider that chooses distinct scope classes for an axis updates only the
scope contribution.

SSR uses the same normalized requests and provider tables. Hydration validates the provider ID,
provider version, build fingerprint, scope contribution, and target contribution ownership. A
mismatch is a hydration diagnostic; the client does not briefly apply the baseline theme and then
swap to an external provider.

## Tailwind adapter

The proposed `@exactjs/theme-tailwind` package supports Tailwind's current source-driven build
model without requiring component libraries to contain Tailwind strings.

### Hybrid mode (recommended)

Hybrid mode keeps `resolveTheme()` and the complete `exact-theme/1` variable publication. The
provider maps semantic requests to literal Tailwind candidates whose arbitrary values point at
stable variables, for example:

```text
bg-[var(--exact-theme-accent-solid)]
text-[var(--exact-theme-accent-on-solid)]
hover:bg-[var(--exact-theme-accent-solid-hover)]
rounded-[var(--exact-theme-radius-md)]
h-[var(--exact-theme-control-height-md)]
```

These are complete strings in the provider manifest; they are never constructed by concatenating
runtime fragments. Arbitrary tonic colors and live theme changes therefore update variables rather
than generating new utilities. Tailwind owns utility realization while eXact continues to own
perceptual derivation, contrast validation, nested inheritance, and inspection.

The adapter generates a CSS fragment containing `@source inline(...)` entries for Tailwind 4 and a
plain candidate text artifact usable by older configured pipelines. The application imports that
fragment adjacent to its Tailwind entry. The adapter verifies the expected generated sentinel rule
during development and production builds.

### Native-palette mode

Native-palette mode maps tones, spacing, radii, and shadows to the application's finite Tailwind
theme keys. It is appropriate when the external design system, rather than eXact's generative
palette, is authoritative. Configuration must provide total mappings for required semantics:

```ts
tailwindThematicProvider({
	mode: 'native-palette',
	tones: {
		accent: 'brand',
		info: 'sky',
		success: 'emerald',
		warning: 'amber',
		danger: 'red',
		neutral: 'slate'
	}
});
```

This mode may support only finite tonic names and appearances. Arbitrary `ThemeColor` input is a
compile-time or runtime diagnostic unless the provider declares a variable bridge. It must not
quantize an arbitrary color silently.

Tailwind responsive and container variants are not inferred from theme semantics. Applications
continue to author layout utilities normally. Provider candidates cover theme roles and their
documented native states only.

## Bootstrap adapter

The proposed `@exactjs/theme-bootstrap` package targets Bootstrap 5.3's classes, color-mode data
attribute, CSS variables, and optional Sass utility build.

The scope contribution uses `data-bs-theme="light"` or `"dark"` when Bootstrap owns appearance.
Hybrid mode bridges validated resolved values into Bootstrap variables on the scope. Static
presentations use appropriate finite classes such as action, emphasis, background, border, radius,
shadow, and spacing classes.

The target descriptor is essential. A field request on a text input can select `.form-control`, a
select can select `.form-select`, and a boolean choice must not be reshaped as either. A provider
may return `unsupported-target` when the semantic role cannot be represented without changing
markup. It may not insert Bootstrap wrapper elements, icons, labels, or JavaScript widget
structure.

Bootstrap component classes are used only where their markup and behavioral expectations match the
existing semantic target. Otherwise the adapter composes utilities or falls back to the baseline
recipe for that role in hybrid mode. Bootstrap's own documentation notes that not every component
uses every theme-color mapping, so the adapter's coverage table must be tested role by role rather
than inferred from a shared color name.

Applications may compile a customized Bootstrap build through Sass. The provider emits a generated
Sass map fragment for additional eXact semantic utilities, but the application explicitly imports
it before Bootstrap's utilities API is generated. Precompiled Bootstrap CSS supports only the
classes and variables proven by the adapter's precompiled coverage fixture.

Bootstrap JavaScript remains application-owned and is never loaded by the thematic provider.

## Baseline provider

The existing `@exactjs/theme/styles.css` recipes become the reference provider without changing
their public semantic output. Initially, `@exactjs/theme` can ship this provider internally to
avoid a package split. Its presenter returns the current `exact-theme-*` classes, data attributes,
surface aliases, and scope variables.

Moving the current behavior behind the provider contract first is important: it proves that the
abstraction represents eXact's complete semantics and provides a behavioral oracle for external
adapters. This migration must produce byte-equivalent SSR attributes and equivalent computed styles
before Tailwind work begins.

## Coverage and fallback

Coverage is explicit by role, variant, modifier, target capability, source axis, and native state.
Each cell is one of:

- `native`: represented by the external system;
- `variable`: represented through a provider variable bridge;
- `baseline`: deliberately uses the built-in eXact recipe in hybrid mode;
- `unsupported`: rejected with a diagnostic.

There is no per-property best-effort guessing. A provider selected in `strict` mode rejects every
`baseline` and `unsupported` cell. `hybrid` mode permits only manifest-declared baseline cells and
includes the corresponding minimal recipe CSS. Development diagnostics identify the request and
fallback; production does not log.

Provider composition is not a public array in v1. A hybrid adapter is itself one provider with one
ownership table. This prevents two independent providers from emitting conflicting classes or
styles onto the same target.

## Security and trust

A provider executes local code in build, SSR, and browser processes and follows the existing
component-library authorization policy. The build manifest is untrusted input until schema,
package identity, version, size limits, token grammar, paths, and fingerprint are validated.

Required limits include:

- at most 4,096 class candidates and 256 variables per provider by default;
- bounded token and stylesheet path lengths;
- package-contained stylesheet paths with no traversal;
- no URL-bearing style values, `@import` text, selectors, or raw CSS returned at runtime;
- provider-owned data-attribute prefixes;
- deterministic serializable diagnostics without authored secrets;
- no fallback from an unauthorized provider to executing a different package.

Tailwind and Sass configuration remains application code with its normal authority. eXact does not
evaluate those configuration files in the browser or treat generated CSS as a security sandbox.

## Inspection and diagnostics

Development inspection should show:

- provider ID, version, build fingerprint, and mode;
- normalized semantic request and target capabilities;
- static or reactive lowering;
- provider-owned classes, styles, variables, and data attributes;
- coverage source (`native`, `variable`, or `baseline`);
- unsupported or conflicting ownership diagnostics;
- the source component and enhancement identity.

Proposed diagnostic codes include:

- `theme-provider-missing`;
- `theme-provider-contract-mismatch`;
- `theme-provider-build-integration-missing`;
- `theme-provider-class-not-manifested`;
- `theme-provider-unsupported-role`;
- `theme-provider-unsupported-target`;
- `theme-provider-unsupported-source`;
- `theme-provider-contribution-conflict`;
- `theme-provider-nondeterministic`;
- `theme-provider-hydration-mismatch`.

Language tools should continue to complete and validate semantic theme attributes. When the
application configuration is available, hover information can additionally show provider coverage
and the resulting static classes. Component-library source must not receive provider-specific
diagnostics merely because its development workspace uses a different CSS system.

## Performance requirements

The abstraction is acceptable only if the baseline provider is effectively free and external
providers do not introduce per-element framework work on scope changes.

Initial budgets relative to the current baseline are:

- no statistically meaningful regression in framework comparison interaction metrics;
- no more than 1% compiler wall-time regression on a theme-heavy application;
- no more than 1 KiB gzip client runtime for an application whose requests all lower statically;
- no more than 3 KiB gzip for reactive provider tables actually used by the application;
- no per-target subscription to scope changes;
- provider tables and class strings tree-shaken to referenced roles where supported;
- no duplicate candidate or presentation module per importer;
- bounded cache entries derived from the finite manifest.

Measure compile time, client parse/compile time, bundle bytes, retained heap, SSR throughput,
hydration time, theme-switch time, and the existing framework comparison percentiles. Report
Tailwind and Bootstrap CSS bytes separately because external CSS policy, not the eXact runtime,
controls them.

## Testing strategy

1. Contract tests validate manifest schemas, token grammar, deterministic fingerprints, output
   bounds, coverage completeness, and runtime-output membership.
2. Baseline conformance runs every existing Theme Lab and stylesheet test through the provider
   boundary and compares SSR output and browser computed styles.
3. Provider golden tests enumerate every role, variant, tone, size, surface bundle, target
   capability, appearance, depth, and relevant native state.
4. Build integration fixtures run real supported Tailwind and Bootstrap/Sass versions and verify
   that every manifested candidate produces a rule.
5. Browser tests cover live role changes, live scope axes, nested scopes, authored-class
   preservation, native states, forced colors, reduced motion, and no stale provider tokens.
6. SSR/hydration tests verify identical provider fingerprints and contributions, including
   streamed and lazy enhancement boundaries.
7. Adversarial tests reject malformed manifests, undeclared classes, unsafe style values, path
   traversal, excessive candidates, nondeterminism, and contribution conflicts.
8. An independent component-library fixture is built once and consumed unchanged by baseline,
   Tailwind, and Bootstrap applications.

Version support belongs to each adapter's tested compatibility matrix. An unknown major version
fails with guidance unless the application explicitly opts into an unverified compatibility mode;
it never changes mapping silently.

## Delivery sequence

### Phase 1: freeze the provider-neutral contract

1. Extract normalized semantic request types from the current enhancement props.
2. Add the generic target descriptor/build facts needed by providers, without theme-specific
   compiler branches.
3. Define contribution ownership, validation, merging, diagnostics, and inspection records.
4. Record the current baseline role/state matrix as conformance fixtures.

### Phase 2: move the baseline behind the boundary

1. Implement the built-in provider with current classes, attributes, aliases, and variables.
2. Statically lower constant requests and narrowly update reactive requests.
3. Prove byte-equivalent SSR structure, equivalent computed styles, hydration stability, and
   performance budgets.
4. Keep the public `theme:*` authoring surface unchanged.

### Phase 3: establish build manifests

1. Generate and validate package-contained provider manifests.
2. Add config-registry selection and shared adapter loading.
3. Add candidate membership checks and CSS-build sentinels.
4. Add DevTools and language-tool inspection.

### Phase 4: Tailwind proof

1. Implement hybrid variable-backed mappings first.
2. Generate Tailwind 4 `@source inline()` and compatibility candidate artifacts.
3. Add native-palette strict mode only after coverage diagnostics are usable.
4. Measure compiler, runtime, CSS, heap, and framework comparison results against baseline.

### Phase 5: Bootstrap proof

1. Implement target-aware mappings against precompiled Bootstrap 5.3 CSS.
2. Add the optional Sass utility fragment and variable bridge.
3. Document unsupported markup-dependent roles rather than synthesizing structure.
4. Repeat conformance and performance gates with the unchanged library fixture.

## Acceptance criteria

The proposal is ready to become stable API only when:

- one independently built component library runs unchanged under all three providers;
- authored classes and ordinary application layout remain unchanged;
- every provider output is represented in its manifest;
- arbitrary generated tonics work in Tailwind hybrid mode without new runtime class strings;
- Bootstrap selects correct field mappings from trusted target capabilities;
- missing CSS integration is detected before release output is accepted;
- live root and nested theme changes preserve DOM identity and native control state;
- server output hydrates without provider replacement or stale-class frames;
- strict and hybrid coverage behavior is explicit and tested;
- security limits and authorization are enforced by every adapter;
- performance budgets pass with 50-sample framework comparison measurements where noise requires
  percentile analysis.

## Rejected alternatives

### Let components request Tailwind or Bootstrap classes directly

Rejected because it makes libraries ecosystem-specific and discards the semantic state needed by
another provider.

### Ask Tailwind for classes at runtime

Rejected because Tailwind generates CSS from statically detectable candidates. A runtime string
has no corresponding rule unless the build already knew about it.

### Have the compiler understand Tailwind and Bootstrap

Rejected because provider packages own mapping/version churn. The compiler should know only the
generic semantic request, target descriptor, and contribution ownership contracts.

### Replace `exact-theme/1` with external palette names

Rejected because arbitrary colors, deterministic contrast correction, nested inheritance,
derivation, SSR, and inspection remain valuable even when an external utility engine realizes the
final declarations. Native-palette mode is an explicit provider limitation, not the universal
contract.

### Permit arbitrary provider CSS strings

Rejected because raw selectors and declarations are difficult to merge, inspect, secure, extract,
or hydrate deterministically. Static stylesheets belong in the build manifest; runtime output is
limited to validated target contributions.

### Stack several providers on one target

Rejected for v1 because ownership and fallback become order-dependent. A single hybrid provider can
compose external and baseline behavior with one declared coverage table.

## Open questions

The following require prototypes, but do not alter the semantic boundary:

1. whether generic target capabilities belong in component-library build facts or a new compiled
   target metadata record;
2. whether Tailwind 3 compatibility is worth a first-party generated candidate artifact or should
   remain community-owned;
3. whether provider-specific style properties should be narrower than the initial shared allowlist;
4. whether CSS-build sentinel verification can be adapter-neutral or requires Vite, Webpack, and
   Bun hooks;
5. whether nested statically registered provider selection is valuable enough for v2;
6. whether the baseline provider should eventually become its own package after compatibility is
   proven.

The first prototype should answer questions 1, 3, and 4 before any external adapter API is
published.

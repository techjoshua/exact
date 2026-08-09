# @exactjs/intl

Enhancement-first internationalization plugin and runtime for eXact. The package keeps authored
TSX as the unavailable-capability fallback while analyzed builds use validated, data-only message
plans and ordinary eXact component ownership.

`@exactjs/intl` combines a cross-build plugin concern with a standard eXact component library. Its
build integration coordinates extraction and catalogs through the shared adapter seam; its build emits the same
component identity facts as other compiled libraries, so the compiler and runtime recognize
`IntlProvider` and the explicit intl components through ordinary branding rather than an intl
allowlist. The `@exactjs/intl/enhancements` entry exports the names consumed by namespaced JSX:
`message`, `plural`, `select`, `currency`, `unit`, `cldr`, and the supported translated-property
names.

## Usage

```tsx
import { createIntlEnvironment, IntlProvider } from '@exactjs/intl';

const environment = createIntlEnvironment({ locale: 'en-US' });

function Page(props: { name: string }) {
	return () => (
		<IntlProvider environment={environment}>
			<p intl:message>Hello, {props.name}.</p>
		</IntlProvider>
	);
}
```

The current package implements protocol-1 descriptors, canonical keys, catalog validation, prepared
activations, generated-artifact registration, reactive locale changes, cardinal selection,
source/translated rendering, allowlisted intrinsic-property projection, currency and date-time
projections, ordinal selection, Temporal duration and relative-time projection, display names,
lists, explicit intl-role components, locale-preferred and mixed semantic units, bounded
length/temperature/area/mass/volume/speed/pressure/energy/power/fuel-economy/digital-storage
conversion, direct intrinsic
structure, and named opaque component fragments. Automatic extraction is supplied by the
build-only native `@exactjs/intl-analyzer` integration and enabled through the Vite, Bun, or
Webpack adapter's experimental `internationalization` option.

Automatic destination units use pinned Unicode CLDR 48 preference data for locale region, semantic
usage, magnitude thresholds, measurement-system overrides, and supported mixed units. Explicit
application preferences take priority, while `intl:convert-to` remains fixed. The published
runtime carries a generated projection of only those CLDR tables it consumes; `cldr-core` remains
a build-time data source and its Unicode license ships beside the derived data.

See the [internationalization reference](../../docs/internationalization.md) for authoring, build
configuration, package catalogs, and current limits.

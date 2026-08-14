# @exactjs/intl

Enhancement-first internationalization for eXact. Authored TSX remains the unavailable-capability
fallback while analyzed builds use validated, data-only plans and ordinary component ownership.

`@exactjs/intl` combines a cross-build plugin with a standard eXact component library. Shared
adapter integration coordinates extraction and catalogs, while ordinary component branding covers
`IntlProvider` and explicit intl components. The enhancement entry exports `message`, `plural`,
`select`, `currency`, `unit`, `cldr`, and supported translated properties.

## Usage

Register the enhancement for every compiled component in the package:

```ts
// exact.config.ts
export * as intl from '@exactjs/intl/enhancements' with { type: 'exact-enhancement', scope: 'package' };
import { defineConfig } from '@exactjs/config';

export default defineConfig({});
```

Then author messages without repetitive component imports:

```tsx
import { createIntlEnvironment, IntlProvider } from '@exactjs/intl';

const environment = createIntlEnvironment({ sourceLocale: 'en-US', locale: 'en-US' });

function Page(props: { name: string }) {
	return () => (
		<IntlProvider environment={environment}>
			<main intl:locale>
				<p intl:message>Hello, {props.name}.</p>
			</main>
		</IntlProvider>
	);
}
```

`intl:locale` reuses the nearest provider (or creates a zero-configuration locale scope) and keeps
the target intrinsic's `lang` and `dir` attributes synchronized across SSR and client updates. Its
locale value uses the CLDR-backed `IntlLocaleString` type; call `defineIntlLocale(value)` to
validate and narrow a dynamic string. Semantic unit preferences otherwise come directly from CLDR
locale data and only need configuration for intentional application or user overrides.
Prefer a semantic intrinsic host for a formatter that owns its complete content; reserve `_` for a
narrower inline range, multiple independently formatted regions, or a value with no suitable host.

The runtime covers messages, translated intrinsic properties, plurals, ordinals, dates, currency,
duration, display names, lists, movable structure, and CLDR-preferred semantic units. Build-only
native analysis and the Vite, Bun, or Webpack adapters coordinate extraction and catalogs.

Formatter instances are supplied by `@exactjs/core`'s bounded realm-wide cache. `IntlProvider`
publishes the active and authored source locales to the component `this.intl` facade. Omitted locale
arguments and explicit requests matching `sourceLocale` use the active locale; unrelated explicit
locales remain explicit. Equivalent formatter requests from different provider roots share the same
immutable native object. The compiler lowers proven native constructor operations and number,
bigint, and `Date` locale-string calls automatically. Helpers can import `intl` from `@exactjs/core`
to use the same pool directly.

Message keys hash a generic translator-facing text and placeholder contract. An optional authored
message name becomes a readable prefix; exact bindings and formatter options use a separate
execution-contract hash and do not enter XLIFF.

The Node-only `@exactjs/intl/language` entry uses eXact's trusted language extension protocol. It
shows inference, message identity, placeholders, targets, and translation coverage on hover. It
also diagnoses invalid messages, locale gaps or contradictions, malformed or stale catalogs, and
incompatible inline codes. Concise inference and coverage inlays are enabled by default and can be
disabled through provider or editor policy. Analyzer-proven fallback text, branches, Temporal
values, and native `Intl.*` expressions are underlined with an inference explanation on hover.
The package-scoped export opts every compiled component into this assistance, including warnings
for likely linguistic content that has not been marked for translation. A file-local attributed
import provides the narrower opt-in when package-wide checking is not desired.
Intentional exclusions use HTML's inherited `translate="no"`; `lang` and `dir` do not suppress the
warning. The check covers text plus supported `alt`, `title`, `placeholder`, and ARIA fallbacks.
The provider entry is build-only and unavailable to browser conditions.

Automatic destination units use pinned Unicode CLDR 48 preferences; explicit application policy
takes priority while `intl:convert-to` stays fixed. See the [reference](../../docs/internationalization.md).

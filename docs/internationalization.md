# Internationalization

## Editor and build validation

`@exactjs/intl` publishes a Node-only analyzer through the generic eXact language-extension
protocol. The compiler supplies canonical enhancement activations and source facts; the provider
reuses `@exactjs/intl-analyzer`, so editor inference and build extraction use the same message
semantics and canonical keys without adding intl rules to the compiler.

Hovering an `intl:*` message shows its source locale, target, durable key, inferred plural,
formatter, temporal, currency, or semantic-unit behavior, and every configured JSON or XLIFF locale
that contains the exact key. Concise inference and translation-coverage inlays are enabled by
default. Authored fragments that actually prove an inference are underlined: this may be fallback
text such as a unit or currency label, a plural or ordinal branch, a Temporal value, or a native
`Intl.*` expression. Hovering the underline explains the inferred behavior and its provider.
Invalid message shapes are errors. Applications may configure required locales and receive a
warning for missing translations, disable provider inlays and their evidence decorations, or
complete CLDR semantic unit identifiers.

When intl is enabled for a file or package, likely linguistic JSX text and supported linguistic
intrinsic properties outside the corresponding intl enhancement receive a `missing-intl` warning.
Use the standard inherited HTML `translate="no"` attribute for content that must intentionally
remain untranslated. `lang` and `dir` describe the content's language and direction; neither is a
translation opt-out.

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	languageExtensions: {
		providers: {
			'@exactjs/intl': {
				sourceLocale: 'en-US',
				catalogFiles: ['locales/fr-FR.xlf', 'locales/ja-JP.xlf'],
				requiredLocales: ['fr-FR', 'ja-JP'],
				catalogHygiene: true,
				localeConsistency: true
			}
		}
	}
});
```

Set the provider's `showInlayHints` to `false` for an intl-only opt-out, or set VS Code's
`exact.languageTools.inlayHints` to `off` for all eXact inlays. VS Code's own
`editor.inlayHints.enabled` setting must also permit inlay hints.

The analyzer host, native analyzer, catalog reads, and LSP integration run only under Node during
development and builds. None of this machinery is reachable from the browser runtime graph.

`@exactjs/intl` is both an eXact plugin and an enhancement library. The plugin side coordinates
source analysis, catalog generation and linking, client capabilities, and bundler integration. The
application-facing side exports ordinary compiled enhancements so localization intent stays in the
TSX that owns the fallback content.

`@exactjs/intl`, the native `@exactjs/intl-analyzer`, and the shared `@exactjs/intl-build`
coordinator implement enhancement-first internationalization through one versioned build contract.

The runnable [`apps/intl-testbed`](../apps/intl-testbed) keeps English, French, Japanese, and
Arabic renderings side by side under shared reactive controls. It deliberately reorders named
intrinsic and opaque fragments in target catalogs, exercises formatter and selection edge cases,
and leaves one ordinary, unenhanced sentence outside the translation workload to expose the
opt-in boundary. Run `npm run dev:intl`; run
`npm run test:intl` to verify that the checked-in source-only extraction manifest and bilingual
XLIFF catalogs have not drifted from their TSX.

The important boundary is executable in Vite, Bun, and Webpack: each adapter analyzes original TSX before ordinary
compilation, emits a package-private prepared activation, and then passes that source through the
standard compiler. The compiler has no message, locale, catalog, plural, currency, Temporal, or
CLDR output fields.

The runtime package is also an ordinary compiled eXact component library. Its published component
build facts identify `IntlProvider` and the explicit intl components, while
`@exactjs/intl/enhancements` exports `message`, `plural`, `select`, `currency`, `unit`, `cldr`, and
the translated-property enhancement names. Component identity therefore comes from the same
compiler brand and package contract used by every component library; neither Suspense nor the
compiler needs an intl-specific component allowlist.

## Enable analysis

```ts
import { exact } from '@exactjs/vite-plugin';

export default {
	plugins: [
		exact({
			internationalization: {
				owner: 'example-app',
				sourceLocale: 'en-US',
				locales: ['fr-FR'],
				catalogFiles: ['./translations/fr.xlf'],
				clientCapabilityProviders: {
					temporal: { kind: 'module', specifier: 'temporal-polyfill/global' }
				}
			}
		})
	]
};
```

`owner` and `sourceLocale` may be omitted when the application package declares its name and
`exact.internationalization.sourceLocale`; the coordinator derives both without evaluating package
code. Development catalog selection targets that source locale unless `developmentLocale` is set,
while every dependency descriptor retains its own package owner and source locale.

The shared build coordinator creates one deterministic companion module for each analyzed source module. The companion
is split again by compiler-recognized owner component. Each component companion hoists its
descriptors, slices matching catalogs, validates them against the exact owner, key, bindings,
operations, and recursion limits, and registers them before application evaluation. Side-effect-free
component companions and tree-shakeable compiler brands let the bundler omit an unused component's
messages even when used and unused components share one source file. The optional `onDescriptors`
callback remains available for translation-tool extraction.

`catalogs` accepts already-loaded protocol objects for generated or programmatic integrations.
`catalogFiles` accepts XLIFF 2.1 (`.xlf` or `.xliff`) or protocol JSON files, resolves them from
`applicationRoot`, and adds them to the build watch set. XLIFF is the persisted translation source
of truth; the coordinator lowers its translated inline-code structure to bounded protocol data only
after it has collected the source descriptors needed to validate it. In development, changing only
a catalog reloads the data, relinks existing virtual
companions under a newer generation, and invalidates those companions without rerunning source
analysis or component compilation.

When analysis is enabled, this source needs no intl-specific compiler support:

```tsx
function Greeting(props: { name: string }) {
	return () => (
		<p intl:message>
			Hello, {props.name}. Read <a href="/terms">the terms</a>.
		</p>
	);
}
```

### Compose one lexical message

An explicit `intl:message` owns all nested selector and formatter enhancements in its lexical
content. Nested `intl:plural`, `intl:select`, `intl:currency`, `intl:unit`, and `intl:cldr` regions
contribute nodes to that one message plan; they do not create independent descriptors or catalog
units:

```tsx
<p intl:message="journey-summary">
	<_ intl:plural={count}>{count === 1 ? 'One delivery' : `${count} deliveries`}</_>
	covering <span intl:unit="distance-road">{distance} miles</span>.
</p>
```

This produces one message key. The plural range is a selector node, the unit is a formatter inside
the retained `span` structure, and shared values are evaluated once per reactive update. The XLIFF
request likewise contains one `<unit>` whose generic inline codes let translators reorder the
selector, formatter, and intrinsic without exposing executable metadata.

When no explicit message encloses a specialized enhancement, that enhancement creates an implicit
message scope for its own range. This is preferred when the role owns an intrinsic's complete
content:

```tsx
<p intl:plural={{ value: count, name: 'inbox-count' }}>
	You have {count ? `${count}` : 'no'} new {count === 1 ? 'message' : 'messages'}.
</p>

<dd intl:unit="distance-road">{distance} miles</dd>
```

An explicit message and one specialized role may share the same host when both apply to the complete
content. More than one selector or formatter role on the same range is ambiguous and receives a
source diagnostic. Nested explicit message boundaries are not merged: keep the message on the
outer lexical range, or expose an independently translated component through a named
`intl:fragment` when it must move within the enclosing translation.

The native TypeScript-Go analyzer recognizes normalized text, shared scalar identifier/property bindings,
finite boolean/exact branches, cardinal and English ordinal fallback ternaries, movable direct intrinsic
children, native `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`,
`Intl.DisplayNames`, and `Intl.ListFormat` calls, and typed Temporal values. Date ranges and
Temporal `toLocaleString()` keep their finite options. It does not descend into ordinary component
invocations. Unsupported regions remain authored fallback output and produce a source-linked build
warning.

Core message structure and explicit standard-`Intl` projections are source-language independent.
For unit fallbacks, the JavaScript build host derives a bounded vocabulary for the configured source
locale from its native `Intl.NumberFormat(..., { style: 'unit' }).formatToParts()` data. The native
analyzer uses Go's CLDR-backed `x/text` locale data for likely regions and conventional currencies.
Language-specific inference is a separate, bounded source-language profile layered over that generic
native data. English suffix ternaries and English unit/currency words remain registered compatibility
shorthand, but are not embedded in the native analyzer or treated as universal grammar. Supplemental
profiles now cover English, German, French, Spanish, Portuguese, Italian, Dutch, Polish, Ukrainian,
Russian, Arabic, Hindi, Japanese, Chinese, Korean, Turkish, and Indonesian. A profile can contribute
unit labels, currency labels, locale-default currency markers, ordinal literal branches, and
distinctive ordinal wrappers without changing traversal or protocol lowering.

Ordinal wrapper inference is not suffix-only. It recognizes bounded prefix/value/suffix forms such
as Japanese `第{position}位`, prefix-only Indonesian `ke-{position}`, Spanish and Portuguese
`{position}.º`/`{position}.ª`, Hindi suffix forms, and profiled full-word branches such as Arabic
ordinals. A matched wrapper lowers to one numeric ordinal selector whose source fallback retains the
exact authored prefix, value, and suffix; a translation can then supply target-locale ordinal
categories and reorder the pieces. Ambiguous punctuation such as an unqualified German or Polish
period is deliberately not treated as sufficient wrapper evidence. Authors in any supported source
locale can state ordinal intent explicitly with
`Intl.PluralRules(locale, { type: 'ordinal' })`; support for that portable form is supplied by the
build host's JavaScript `Intl` implementation.

An ordinary component or caller-owned child range can participate only as an explicitly named,
opaque, exactly-once slot. The analyzer consumes the marker but never enters the wrapped content:

```tsx
<_ intl:message>
	Welcome,
	<_ intl:fragment="user">
		<UserBadge />
	</_>
	.
</_>
```

Translations may move `user`, but cannot duplicate it, replace it, or translate `UserBadge` through
the enclosing message. Any messages owned by that component remain independent. `fragment` is
declared by the package as a generic analyzer-only enhancement field: the compiler validates and
removes it, while only the intl analyzer assigns its message-slot meaning. It never mounts an intl
runtime component on the marked child.

Clock progression composes without becoming Intl behavior. A nested `time:update` range lends its
range-local clock sample to preparation of the enclosing lexical message, so translated native
`Intl.RelativeTimeFormat` values and authored fallback content update together. The time package
owns sampling and scheduling; this package continues to own translation and cached locale-sensitive
formatting. See [Clock-derived views](date-time.md).

Finite relative-duration projections are summarized onto one reactive duration binding. Both the
nested plain-language fallback and the equivalent source-local array/`find`/
`Intl.RelativeTimeFormat` helper are supported. Direct `Temporal.Duration` values select duration
formatting. Ordinal suffix branches, including suffixes inside a direct `<sup>` intrinsic and
literal Unicode superscripts, use target-locale ordinal plural rules while preserving the authored
fallback when the enhancement is unavailable. A lookup such as
`suffixes[ordinalRules.select(position)]` is also recognized when the rules locale, options, and
category-to-literal map are static; this is the preferred unrestricted form and correctly handles
English values such as 21st, 22nd, and 23rd.

Static locales on recognized native `Intl` expressions must agree with the package
`sourceLocale`. A language-only locale is compatible with a more specific source locale (`en` with
`en-US`), while an explicit conflicting region or language (`en-GB` or `fr-FR` with `en-US`) is a
source-linked diagnostic. The static locale describes the executable authored fallback; translated
output still uses the active target locale.

The same static lookup shape supports cardinal systems without assuming that every language has an
English `one`/`other` split:

```tsx
const rules = new Intl.PluralRules('pl-PL');
const forms = {
	one: 'wiadomość',
	few: 'wiadomości',
	many: 'wiadomości',
	other: 'wiadomości'
};

<p intl:message>
	{count} {forms[rules.select(count)]}
</p>;
```

The same form supports native plural ranges without enumerating endpoint-category combinations:

```tsx
const rules = new Intl.PluralRules('sl-SI');
const rangeForms = {
	one: 'en predmet',
	two: 'dva predmeta',
	few: 'nekaj predmetov',
	other: 'predmeti'
};

<p intl:message>{rangeForms[rules.selectRange(start, end)]}</p>;
```

The analyzer records `start` and `end` as two reactive selector bindings. The runtime calls the
active target locale's `Intl.PluralRules.selectRange()` once and selects one translator-authored
category branch; it does not independently pluralize the two endpoints. Cardinal and ordinal rule
types are both preserved.

eXact targets modern browsers whose native `Intl.PluralRules` includes `selectRange()`. It does not
load a separate plural-rules provider; an unsupported runtime receives an explicit capability error
instead of silently changing range semantics. The configured Temporal and duration-format providers
remain independent and do not polyfill plural rules.

Focused category fixtures cover Arabic (`zero`, `one`, `two`, `few`, `many`, `other`), Polish
(`one`, `few`, `many`, `other`), French (`one`, `many`, `other`), and Hindi (`one`, `other`). The
broader native-profile matrix covers `en-US`, `es-MX`, `pt-BR`, `de-DE`, `fr-FR`, `pl-PL`,
`ru-RU`, `uk-UA`, `ar-EG`, `hi-IN`, `bn-BD`, `ja-JP`, `zh-Hans-CN`, `ko-KR`, `tr-TR`, and
`id-ID`. The test bed exposes the four focused source-locale lookups side by side under the shared
count control.

Semantic road distances can express a single value or range without selecting a measurement
system:

```tsx
<dd intl:unit="distance-road">
	{minimumDistance}-{maximumDistance} miles
</dd>
```

Prefer an intrinsic host when the formatter owns that element's complete content. Use the `_`
fragment form only when the formatted value is a narrower inline range within a host, when several
independent formatter regions share one host, or when no semantic host element is appropriate.

The bounded implementation infers the source unit from a recognized fallback label or the package
source locale, localizes unit plurality, and keeps one visible unit on a range. Enhancement-first
semantic families now cover length, temperature, area, mass, volume, speed, pressure, energy,
power, road fuel economy, and digital storage. Representative purpose-specific selectors include
`area-land`, `mass-person`, `volume-liquid`, `speed-road`, `pressure-weather`, `energy-food`,
`energy-electricity`, `power-engine`, `fuel-economy-road`, and `digital-storage`; the corresponding
exact selectors use `<quantity>/<usage>`.

A static `intl:convert-to` overrides presentation with any dimensionally compatible unit from the
shared conversion vocabulary. Without a fixed override, application or user policy takes priority,
then the runtime selects from Unicode CLDR 48 unit-preference data by semantic quantity, usage,
maximized locale region, and evaluated magnitude. Region data falls back to CLDR's `001` world
entry. Unicode `u-ms-ussystem`, `u-ms-uksystem`, and `u-ms-metric` locale extensions override the
regional measurement system using CLDR's unit-system compatibility rules, while `u-rg` overrides
the region used for preference lookup. CLDR compound destinations produce mixed output such as feet/inches,
meters/centimeters, stones/pounds, or pounds/ounces.

Semantic eXact usages map to their CLDR counterparts where the vocabulary differs:
`volume/liquid` uses CLDR `volume/fluid`, `pressure/weather` uses `pressure/baromtrc`,
`speed/road` uses `speed/default`, and `fuel-economy/road` uses
`consumption/vehicle-fuel`. A range uses the largest absolute endpoint for threshold selection so
both endpoints retain one destination unit. Unsupported CLDR destinations are skipped safely; a
quantity without CLDR preference data, such as digital storage, retains the authored source unit
unless application policy or `convert-to` selects another.

The package generates and drift-checks a compact projection of the supported CLDR tables. The full
`cldr-core` data set remains a development dependency and is not included in application bundles;
the derived projection carries the Unicode data license.

Conversions include multiplicative, offset-safe Celsius/Fahrenheit/Kelvin, and reciprocal
MPG/L-per-100-kilometer formulas. Source labels are bounded rather than parsed as arbitrary prose;
case remains significant where it carries meaning, such as `Mb` (megabits) versus `MB`
(megabytes).

The renderer uses native `Intl.NumberFormat` whenever its unit syntax supports the destination.
For engineering units that ECMA-402 does not expose, such as `kPa`, `kWh`, and `hp`, it still uses
native locale-aware number formatting, placement, spacing, and bidi behavior and supplies the
standardized unit symbol. That fallback deliberately does not invent localized long-form unit
names.

Unless a formatter supplies an explicit fraction- or significant-digit option, unit conversion
preserves the visible precision of the evaluated source value and rounds only after conversion. A
whole-number range such as `12-18 miles` therefore becomes `19-29 kilometers`, not
`19.312-28.968 kilometers`; `72 °F` becomes `22 °C`. A source value with one visible fractional
digit retains at most one after conversion. For dynamic values the runtime can observe only the
evaluated number, so an authored `Math` operation or `Intl` formatter is the way to assert different
precision. An explicit precision option always wins.

When preserving the source fraction count would round a finite nonzero conversion to zero, the
runtime retains the minimum additional fraction digits needed to keep it nonzero. For example, a
whole-number fuel-economy source converted to CLDR's `liter-per-kilometer` preference remains a
meaningful fractional value instead of displaying `0 L/km`.

CLDR preference skeletons do not replace this source-precision contract. eXact uses CLDR to choose
the destination unit and magnitude threshold, then applies the authored or source-inferred precision
rules described above.

Currency activation similarly infers presentation from the fallback and then the package source
locale. The build host derives a bounded currency-name and symbol vocabulary from native
`Intl.supportedValuesOf('currency')` and `Intl.NumberFormat(...).formatToParts()` across operands
selected by the source locale's cardinal rules. Ambiguous labels are discarded, while ISO codes
remain stronger syntax-level evidence for code display. Consequently `euros` in `fr-FR`, `भारतीय
रुपए` in `hi-IN`, `złotego polskiego` in `pl-PL`, and `ج.م.` in `ar-EG` infer their respective
currency and name/symbol presentation without language tables. With `sourceLocale: 'en-US'`,
`<_ intl:currency>{total}</_>` means USD with symbol display; `{total} USD` selects code display,
and `{total} US dollars` selects name display. An explicit currency or display remains available
when the source is ambiguous. Currency values are formatted, never exchange-rate converted.

Allowlisted human-facing intrinsic properties use the same pattern and catalog validation:

```tsx
<input placeholder="Search messages" intl:placeholder />
<button
	aria-label={count === 1 ? `Delete ${count} message` : `Delete ${count} messages`}
	intl:aria-label={{ name: 'delete-control' }}
/>
```

The implemented allowlist is `alt`, `title`, `placeholder`, `aria-label`, `aria-description`,
`aria-roledescription`, and `aria-valuetext`. Each activator requires its fallback property on the
same direct intrinsic. Property plans accept scalar values and finite branches but never structural
slots. Active translations replace only that fallback through a framework-owned target layer;
unrelated properties, events, refs, and intrinsic identity remain intact.

These localized scalar fallbacks may coexist with `@exactjs/accessibility` ref relationships such
as `a11y:labelledBy` and `a11y:describedBy`. Intl remains the only translation writer;
accessibility publishes stable ID references and validates the semantic shape. Neither enhancement
suppresses the other, and the browser's standard accessible-name precedence selects the effective
source.

A property activator can carry the same finite formatter role, for example
`intl:aria-label="display-name:languageCode"`. Native formatter calls, plurality, and ordinal
branches are inferred through the same expression analysis used for content messages. A pure
display-name projection is formatter-only: it uses locale data directly and therefore has a stable
descriptor key but no XLIFF unit or translated-locale coverage requirement.

After ordinary compilation, every adapter joins each analyzer-local owner ordinal to the corresponding
public `ExactComponentBuildFacts.components` identity. A message outside a compiler-recognized
component is a build error. The analyzer does not derive or mint compiler component IDs. The
compiler remains unaware of message, catalog, translation, and CLDR semantics; its general
ECMA-402 lowering recognizes proven native formatter operations and routes them through core's
cache-backed `this.intl` service.

## Provide locale and catalogs

```ts
import { createIntlEnvironment, IntlProvider } from '@exactjs/intl';
const environment = createIntlEnvironment({
	sourceLocale: 'en-US',
	locale: 'fr-FR'
});

function App() {
	return () => (
		<IntlProvider environment={environment}>
			<main intl:locale>{/* application */}</main>
		</IntlProvider>
	);
}
```

`intl:locale` projects reactive `lang` and `dir` attributes onto its intrinsic during SSR,
hydration, and client updates. A valueless activation reuses the nearest `IntlProvider`; an
explicit locale uses a cached locale scope from that provider, or creates a zero-configuration
environment when there is no provider. Locale literals are constrained by the CLDR-backed
`IntlLocaleString` type and validated as BCP 47 by the intl analyzer. Validate and narrow a dynamic
route, header, or user value before use:

```ts
import { defineIntlLocale } from '@exactjs/intl';

const locale = defineIntlLocale(requestedLocale);
```

Semantic unit preferences default from CLDR using the locale's likely region and Unicode `u-rg`
or `u-ms` overrides. Applications only provide the finite, dimension-checked
`IntlUnitPreferences` entries that intentionally override those defaults.

`environment.setLocale(locale)` is reactive and atomic. Generated companions are discovered
automatically; missing messages use the analyzed source plan. DOM, synchronous SSR, and hydration
use the same plan and preserve direct-intrinsic identity across binding and locale changes.
Translator data cannot provide functions, component identities, HTML, handlers, URLs, or undeclared
bindings. Native `Intl` formatter instances live in one bounded, lazily created realm-wide cache
owned by `@exactjs/core`. Each localization context resolves omitted locales—and an explicit locale
equal to its declared `sourceLocale`—to the active locale before consulting that pool. Other
explicit locales retain their authored meaning, while independent roots reuse identical
locale/options combinations without sharing locale state. The compiler lowers proven constructor
chains, finite local formatter bindings, and native
number, bigint, and `Date` locale-string methods to `this.intl`; it removes a finite formatter
declaration when all uses become cache operations. Escaping objects retain their binding but obtain
the formatter through the cache. That component reference also makes the compiler import core's
localization capability registration into the component's own bundle. Components that never use
`this.intl` therefore omit the formatter pool, while lazy modules and microfrontend bundles carry
the capability when their own compiled components require it; the shell does not need to predict
their requirements. Compatibility integrations that construct framework values outside compiled
component source can opt in with a side-effect import of `@exactjs/core/localization`. Helpers
outside components can import the same global facade:

```ts
import { intl } from '@exactjs/core';

export function formatPrice(value: number, locale: string) {
	return intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(value);
}
```

Dynamic option objects with accessors or non-data prototypes deliberately bypass reuse so cache
keying cannot change observable JavaScript behavior. A missing constructor is not cached; a
capability polyfill may fill it once before the first successful formatter request.

## Package catalogs and interchange

The translation workflow has distinct authored, extraction, and translated artifacts:

1. A developer writes ordinary fallback content in the package source locale inside marked TSX.
2. Build tooling analyzes that code and writes a source-only XLIFF 2.1 request. It has `srcLang`,
   `<source>` units, placeholders, branches, and structural inline codes, but no `trgLang` or
   `<target>` elements. Formatter-only and value-only descriptors are runtime work rather than
   language, so they are omitted; the same formatter placeholders remain present when embedded in
   a sentence that translators must reorder. In the test bed this is
   [`locales/en-US.xlf`](../apps/intl-testbed/locales/en-US.xlf); naming it after `srcLang` keeps it
   symmetrical with the bilingual locale files while the absence of `trgLang` identifies its role.
3. That targetless file is sent to a translation platform, AI workflow, or human translator. Each
   requested locale returns a bilingual XLIFF file with `trgLang` and translated `<target>` units.
4. Those locale XLIFF files become the persisted authority for translated content. Synchronization
   updates their analyzer-owned sources without replacing compatible translator-owned targets,
   notes, or review state, and removes units no longer present in the generated source set.
5. The bundler validates and lowers the selected translations into disposable runtime protocol
   data.

`exportXliff21SourceCatalog()` creates the targetless translation request from a completed
descriptor set. It deliberately does not translate, choose target locales, or copy a target from
another catalog. A new locale starts from that source manifest; untranslated units may remain
without `<target>` and therefore use the authored fallback.

Installed dependencies can publish inert message contracts and locale catalogs through the fixed
`exact.internationalization` package metadata. The shared coordinator discovers those declarations
without evaluating package code, selects only configured/application catalog locales, validates
public export boundaries, and watches the selected files. Application catalogs and overrides retain
authority over library catalogs.

Runtime lookup follows the same canonical target chain used during selection—for example,
`fr-CA` then `fr`, and script-preserving candidates such as `zh-Hant` before the base language—so a
selected dependency catalog is not stranded by a more specific application locale.
Descriptor companions loaded by a lazy component advance the shared artifact revision. Existing
default environments synchronize that revision on lookup, validate the new descriptor/catalog
slice, and can render the lazy translation without recreating the root provider.

`@exactjs/intl-build` exposes source extraction, XLIFF 2.1 import, export, and synchronization plus
a protocol-JSON adapter for generated integrations. XLIFF is the human and workflow-facing format. Plain
text remains ordinary XLIFF text; values and formatter results use `<ph>`, movable intrinsics and
selectors use `<pc>`, and selector branches use standard generic `<mrk>` annotations. The document declares
`version="2.1"` in XLIFF's `urn:oasis:names:tc:xliff:document:2.0` core namespace, as required by
XLIFF 2.1; the namespace name intentionally did not change from 2.0. Translator files contain no
eXact namespace, executable binding indexes, formatter options, or proprietary runtime data.
Generic inline-code `equiv`, `canCopy`, and `canDelete` fields form the translator guide. The
build-owned execution contract remains beside compiled descriptors and is joined to those generic
codes only after import.

Message identity hashes the source locale, target, generic text/inline-code pattern, and placeholder
guide. It deliberately excludes eXact execution metadata, so an internal lowering change does not
invalidate translations. `intl:message="checkout-total"` (and `name` in finite object or explicit
component forms) prefixes that hash with a normalized readable name; the hash still prevents two
different messages with the same name from colliding. A separate execution-contract hash validates
the current binding and formatter plan and allows equivalent runtime contracts to be reused.
Unless a property supplies its own explicit object-form `name`, a supported intrinsic property on
or within a named content message derives a readable prefix from that nearest message and the
property name: `intl:message="account"` therefore yields prefixes such as `account_placeholder`
and `account_aria-label`. The content and placeholder contracts still contribute independent
hashes, so the readable relationship does not weaken identity or collision resistance.

Synchronization rewrites current `<source>` plans, preserves compatible `<target>` markup, notes,
segment state, and translator ordering, and removes obsolete units. Import rejects stale or duplicate
units and incompatible protected-code changes; untranslated targets intentionally use source fallback. Runtime JSON
is derived, validated build data and should not be edited or committed as the authoritative
translation catalog.

The internal prepared activation, companion registration, and validation APIs are build-tool
contracts; application code should not construct them. Message analysis remains lexical and does
not descend through arbitrary component implementations. Explicit `IntlMessage`, `IntlPlural`,
`IntlSelect`, `IntlCurrency`, and `IntlUnit` components publish the same finite roles as their
enhancement forms. Build analysis folds nested roles into the nearest lexical message and emits one
prepared renderer activation; a standalone specialized role receives an implicit message scope.

Each adapter's `onClientRequirements(requirements, moduleId)` callback reports the finite
`temporal` and `intl-duration-format` requirements discovered for each analyzed module. Generated
companions export the same requirement list. `clientCapabilityProviders` lets the shared generator
map either identifier to `{ kind: 'native' }`, a bundled side-effect module, or a pinned HTTPS CDN
script. Bundled and CDN providers are emitted only into client companions and run before the
dependent descriptor registers; CDN definitions require Subresource Integrity and are deduplicated
through a bundle-independent global promise. The application's Content Security Policy must allow
the configured URL. Server builds emit no provider because the supported Node baseline supplies
these features. Source analysis records only the capability identifier and never embeds a provider
or URL.

See the [implementation record](history/enhancement-first-internationalization.md) for the delivered design
and acceptance gates.

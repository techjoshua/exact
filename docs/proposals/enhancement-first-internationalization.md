# Enhancement-first internationalization

## Status

Proposed after
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md) and
[`server-component-library-trust.md`](../history/server-component-library-trust.md). Its runtime composition
model must not be finalized until the exploratory
[`cooperative-structured-children.md`](cooperative-structured-children.md) proposal is resolved. It
must consume either that proposal's accepted generic contract or the narrower replacement recorded
by its explicit rejection; an unresolved exploratory document is not a valid prerequisite outcome.
This proposal remains before
[`lazy-interaction-islands.md`](lazy-interaction-islands.md),
[`compiler-planned-structural-refresh.md`](compiler-planned-structural-refresh.md),
[`partial-prerender-resumption.md`](partial-prerender-resumption.md), and
[`webpack-bun-microfrontend-parity.md`](webpack-bun-microfrontend-parity.md). It can be implemented
independently of
[`component-value-callback-bindings.md`](component-value-callback-bindings.md), but both proposals
precede the broader lazy-island delivery in the repository queue.

The enhancement proposal supplies finite activator maps, optional ordinary-component activation,
and direct `_` composition boundaries. The trust proposal authorizes any selected component-library
implementation before it enters a server-executing artifact. This proposal adds portable message
analysis, an official internationalization component library and enhancement surface, and an
optional framework plugin for cross-host catalog coordination without allowing plugins to install
compiler callbacks.

The cooperative-children proposal is intentionally not accepted. Examples below establish desired
internationalization behavior, not a settled choice between compiler-owned message slots,
structured child inspection, cooperative capability props, or a narrower internationalization
runtime. Internationalization may continue to refine catalog and Unicode semantics while that
runtime boundary remains open, but it is not ready for final acceptance or implementation planning
that depends on the unresolved composition model.

| Concern                         | Owner                                                         |
| ------------------------------- | ------------------------------------------------------------- |
| Authored source fallback        | Ordinary TSX, branches, expressions, and `_` fragments        |
| Message and formatter analysis  | Compiler-owned finite internationalization contract           |
| Optional translated rendering   | `@exactjs/intl` ordinary components and enhancements          |
| Catalog and locale coordination | Internationalization framework-plugin host projections        |
| Unit conversion and preferences | Versioned `@exactjs/intl` Unicode data and application policy |
| Package execution trust         | Bundler-enforced server component-library policy              |
| Catalog identity                | Normalized semantic source message plus optional context      |

## Decision

Add enhancement-first internationalization whose authored content remains directly executable when
translation support or a translated catalog is absent. Components opt specific message regions and
formatted values into analysis through the standard namespaced enhancement syntax. The compiler
emits a normalized, typed, portable message representation; it does not translate source, load
catalogs, negotiate locales, execute a framework plugin, or decide whether an enhancement is
bundled.

The final application may include the official internationalization enhancement components and
framework plugin. When present, they resolve translated message plans, coordinate the same locale
and catalog across SSR and hydration, split catalogs with the component/artifact graph, and format
or convert typed values. When absent, the authored target or `_` fragment remains unchanged under
the normal enhancement fallback contract.

Use enhancement syntax wherever it expresses the operation cleanly. Retain explicit component APIs
for required composition and low-level library use, but do not require application components to
construct message objects, call format helpers, allocate binding maps, or assign manual translation
identifiers for ordinary messages.

## Goals

- Let component libraries author translation-ready components without requiring the consuming
  application to activate internationalization or ship translations.
- Let every package declare its own source locale while a consuming package's development entry
  automatically requests that locale's translations from its dependencies.
- Preserve ordinary source behavior as the local and unavailable-capability fallback.
- Make message extraction, placeholder typing, branch recognition, catalog reachability, and
  server/client agreement compiler- and bundler-checkable.
- Use normalized semantic source messages as catalog keys rather than mandatory authored IDs.
- Express numbers, currencies, units, dates, times, lists, relative values, pluralization, and
  selection through ordinary enhancement composition.
- Convert units automatically when locale, usage, magnitude, and application/user policy indicate a
  different destination unit.
- Keep currency conversion, translation services, and application content policy outside the
  formatter runtime.
- Preserve setup-once component ownership, expression-level reactivity, inspectable enhancement
  instances, deterministic cleanup, and artifact-local server/client coordination.

## Non-goals

- Automatically treating every JSX text node as translatable.
- Requiring a translation-management vendor, catalog file format, or network service.
- Executing translator-provided JavaScript, HTML, components, URLs, or event handlers.
- Allowing a framework plugin to register arbitrary compiler visitors, transforms, directives, or
  parser callbacks.
- Inferring currency exchange rates or converting monetary value between currencies.
- Making locale the owner of application data, component state, routing, or user preferences.
- Hiding source-message changes behind compatibility keys or migration aliases in this pre-stable
  framework.

## Package and host boundaries

The first delivery should separate browser-safe authoring/runtime contracts from host integration:

- `@exactjs/intl` owns explicit components, enhancement exports, locale/message runtime contracts,
  formatter implementations, unit conversion, and versioned Unicode data needed by selected
  artifacts;
- an inert browser-safe contract entry owns compiler-recognizable role brands and portable message
  IR types without importing host code;
- the compiler recognizes only that finite framework-owned contract and emits portable facts; and
- the internationalization framework plugin owns catalog adapters, configuration, locale
  negotiation policy, build projection, render/server/client coordination, and testing projection.

The component/enhancement and framework-plugin surfaces are independently activated. Importing an
internationalization enhancement does not discover or prepare a framework plugin. Installing the
framework plugin does not make every component message-enabled. A package may distribute both
surfaces together only if its manifest, exports, documentation, trust classification, and host
entries keep their responsibilities explicit as required by the enhancement proposal.

The framework plugin may translate validated configuration into ordinary compiler options and
consume compiler-emitted message metadata. It may not execute inside compiler analysis. The
compiler and language tools remain deterministic without loading package callbacks.

## Enhancement-first authoring

An attributed import establishes the local internationalization namespace:

```tsx
import { _ } from '@exactjs/jsx';
import * as intl from '@exactjs/intl/enhancements'
	with { type: 'exact-enhancement' };
```

### Message regions

Mark a complete message on markup the component already owns:

```tsx
<p intl:message>Welcome, {this.props.name}.</p>
```

Use `_` when the message is inline, structural, or should not add an intrinsic element:

```tsx
<p>
	<_ intl:message>Welcome, {this.props.name}.</_>
</p>
```

An active enhancement on an intrinsic follows the ordinary intrinsic-target enhancement contract.
An active enhancement on `_` becomes that fragment boundary and receives the authored children.
An unavailable enhancement leaves the intrinsic or transparent fragment content unchanged.

The compiler analyzes only explicitly marked regions. Unmarked text remains ordinary application
content and does not enter a catalog merely because it is a descendant of a locale provider.

### Formatted values

Formatter activators and their children jointly describe semantic source information. The fragment
child supplies the reactive magnitude or value; an activator value supplies a source unit, currency,
or selector when that formatter requires one:

```tsx
<_ intl:number>{this.state.count}</_>

<_ intl:currency="USD">{this.state.total}</_>

<_ intl:unit="kilometers" intl:usage="distance-road">
	{this.state.distance} kilometers
</_>

<_ intl:usage="distance-road">{this.state.distance} miles</_>

<_ intl:cldr="length/road">{this.state.distance} miles</_>

<_ intl:date intl:style="long">{this.props.createdAt}</_>

<_ intl:list intl:style="long">{this.props.participants}</_>
```

The activator selects its mapped ordinary component. `unit`, `usage`, and `cldr` all map to the same
unit component; normal canonical-component deduplication therefore produces one instance when a
selector and an explicit unit appear together. `usage` and `cldr` are mutually exclusive selectors
for that instance. Other namespaced attributes are distributed as ordinary props according to the
finite activator/component contracts established by the enhancement proposal. The compiler
validates that the fragment contains the value shape required by the selected formatter. A simple
scalar formatter requires exactly one effect-free reactive value expression. It may also contain
static source-locale text that makes the directly executed fallback complete, such as the unit label
in `{distance} miles`, but it cannot contain another reactive value or uncontrolled structural
output. When active, the formatter replaces the complete annotated range; it does not append its
output beside the authored fallback text.

Formatter fragments compose inside complete messages:

```tsx
<_ intl:message>
	Items: <_ intl:number>{count}</_>.
</_>
```

### Explicit components

Every enhancement implementation remains an ordinary component and may be exported explicitly:

```tsx
<IntlMessage>Welcome, {this.props.name}.</IntlMessage>

<IntlUnit unit="kilometers" usage="distance-road">
	{this.state.distance}
</IntlUnit>

<IntlUnit cldr="length/road">{this.state.distance}</IntlUnit>
```

Use explicit components when translated behavior is required by the component's design, when direct
composition is clearer, or when building lower-level internationalization infrastructure. The
enhancement and explicit forms must share one implementation and message IR rather than diverging
into optional and required formatting systems.

## Source-local and unavailable behavior

There are two distinct fallback cases:

1. If the internationalization component is active but no translated catalog entry exists, it
   executes the compiler-emitted source message plan using the owning package's source locale and
   source formatter instructions.
2. If the optional enhancement implementation is unavailable, the authored intrinsic or `_`
   fragment executes unchanged under the normal enhancement contract.

Formatter fallback content must therefore remain meaningful without the optional implementation.
For a unitized value, the annotated range includes both the value expression and its authored
source-locale unit presentation:

```tsx
<_ intl:message>
	Only <_ intl:usage="distance-road">{this.state.airportDistance} miles</_> from the airport.
</_>
```

With no internationalization implementation, this renders the authored sentence directly. With the
implementation active, the inner formatter becomes one typed unit placeholder in the outer message
plan and replaces the complete `{airportDistance} miles` range. A translation may reorder that
placeholder, and its unit formatter may convert and render it as, for example, `8 kilomètres`; the
literal source word `miles` is fallback presentation rather than an independently translated token.
The compiler derives unit identity from `intl:unit`, a typed measurement, package policy, or the
selector plus `sourceLocale`, never by parsing arbitrary fallback prose. It diagnoses a fallback
label only when it can prove that the label contradicts the resolved source unit.

Component libraries therefore publish usable authored behavior without requiring translations.
They may also remain usable when the application does not bundle the internationalization
enhancement, subject to the literal fallback the component author chose. The compiler must not
silently synthesize required runtime formatting into an unavailable enhancement target.

Development warns once for an active message whose requested translated entry is missing. Production
uses the configured source-locale plan and never exposes an opaque hash or internal message key to
users. Strict builds may require complete catalogs for selected locales and reachable messages.

## Normalized message identity

The catalog key is derived from a normalized semantic representation of the authored message, not
from source position, filesystem path, English text alone, or a mandatory handwritten identifier.
Normalization includes:

- significant source text and punctuation;
- structural branch kind and canonical case ordering;
- placeholder occurrence and reuse;
- formatter kind, source unit/currency, usage, and semantically relevant options;
- safe named structural fragments; and
- an optional authored disambiguation context.

Normalization excludes:

- indentation and insignificant JSX whitespace;
- local variable paths such as `this.state.total`;
- source locations and generated artifact paths;
- static source-locale presentation inside a typed scalar formatter range, which is retained for
  direct fallback and translation tooling but whose semantics come from the formatter role,
  resolved source unit, usage, and options;
- attribute ordering where order has no semantics; and
- runtime locale, catalog version, or translated content.

Placeholder slots are alpha-normalized by first semantic occurrence so a local variable rename does
not invalidate translations. The emitted contract retains human-readable inferred names for
translation tools and diagnostics, but those names do not change the key unless the author explicitly
uses a semantic placeholder name. Repeated references to the same compiler-proven value reuse one
slot.

The canonical normalized message is retained for diagnostics and catalog interchange. Runtime
lookup may use a deterministic digest of that canonical value. Catalog ownership/provenance remains
separate from the key so two packages cannot accidentally override each other's message merely by
authoring the same source sentence.

An optional context resolves genuine ambiguity:

```tsx
<_ intl:message intl:context="navigation">Home</_>

<_ intl:message intl:context="property-description">Home</_>
```

Context participates in normalized identity. Changing source meaning, formatter semantics, or
context intentionally creates a new key. Build tooling reports obsolete catalog entries; it does
not preserve automatic migration aliases.

## Structural selection and pluralization

Pluralization and selection are structural branches, not scalar format calls. Authors use ordinary
code branches inside an explicitly classified message boundary:

```tsx
<_ intl:plural={this.state.itemCount}>
	{this.state.itemCount === 1 ? (
		<>One item</>
	) : (
		<>
			<_ intl:number>{this.state.itemCount}</_> items
		</>
	)}
</_>
```

Selection uses the same model:

```tsx
<_ intl:select={this.props.role}>
	{this.props.role === 'owner'
		? 'Invite an owner'
		: this.props.role === 'member'
			? 'Invite a member'
			: 'Send an invitation'}
</_>
```

The authored branch remains the directly executable source fallback. Inside an explicit
`intl:plural` or `intl:select` region, the compiler also lowers a pure, statically understandable
branch tree into message selector IR. It must prove that:

- branch predicates derive only from the declared selector and immutable constants;
- comparisons and fallthrough are finite and deterministic;
- a complete fallback branch exists;
- evaluating the branch introduces no effects; and
- every branch produces valid message content and compatible placeholders.

An unsupported predicate is a focused diagnostic on the explicitly internationalized region rather
than a guessed translation. Ordinary branches outside such a region retain ordinary compiler
behavior.

Plural translations do not execute the authored `count === 1` condition universally. The source
locale interprets the authored fallback cases; target catalogs may provide `zero`, `one`, `two`,
`few`, `many`, `other`, and exact numeric cases. The active runtime selects target cases with the
resolved locale's plural rules. A translation may add locale-required categories while retaining the
source `other` branch as the required semantic fallback.

## Safe structural fragments

Translations sometimes need to reorder a link, emphasized phrase, icon label, or component-owned
range. A nested fragment enhancement can expose a finite structural slot:

```tsx
<_ intl:message>
	Read our
	<_ intl:fragment="terms">
		<a href="/terms">terms of service</a>
	</_>
	.
</_>
```

The compiler records `terms` as a movable structural placeholder. A translation may reposition the
slot and translate its permitted message content, but it cannot replace the component identity,
change `href`, add props or handlers, inject HTML, or invoke arbitrary code. Unnamed structural
children receive stable positional slots only when the compiler can prove an unambiguous finite
shape; otherwise the author must name the fragment.

Catalogs contain message data and formatter/slot instructions, never executable VNodes or component
implementations.

## Numbers, currencies, dates, times, lists, and relative values

The finite formatter set should initially include:

- decimal, percent, compact, and ordinal numbers;
- currency display for an explicitly supplied source currency;
- dates and times with explicit or context-provided time zones;
- relative time with an explicit unit or compiler-proven temporal value;
- conjunction, disjunction, and unit lists; and
- unitized numeric values as specified separately below.

Formatter options use typed enhancement props and canonical kebab-case JSX names. Locale-sensitive
defaults come from the active locale. Host process defaults must not silently determine time zone,
currency, calendar, or measurement policy during SSR.

Currency formatting never implies currency conversion. The following formats a value denominated in
USD:

```tsx
<_ intl:currency="USD" intl:display="symbol">
	{this.state.total}
</_>
```

Converting USD to EUR requires application-owned exchange-rate data and an ordinary derived value or
task. Neither translators nor the internationalization package may invent a rate.

## Units and automatic conversion

The unit formatter supports explicit-unit, inferred-unit, and fully explicit forms:

```tsx
<_ intl:unit="kilometers">{this.state.distance} kilometers</_>

<_ intl:usage="distance-road">{this.state.distance} miles</_>

<_ intl:cldr="length/road">{this.state.distance} miles</_>

<_ intl:unit="kilometers" intl:usage="distance-road">
	{this.state.distance} kilometers
</_>
```

These usage-only examples assume an `en-US` owning package whose source-locale convention resolves
road distance to miles. The static unit text is the direct source fallback; it is not used to infer
the source unit and is replaced with the whole annotated range when the formatter is active.

`intl:unit` supplies the source unit and implicitly uses the unit preference `default` when no
selector is authored. `intl:usage` selects a finite eXact semantic alias, while `intl:cldr` selects
an exact Unicode CLDR `<quantity>/<usage>` pair such as `length/road`, `length/rainfall`, or
`speed/rainfall`. Both are activators for the same unit component and may omit `intl:unit` when the
compiler can resolve a source unit from the value or owning package. The complete CLDR pair is
required: a bare usage such as `rainfall` is invalid even if it happens to be unique in the pinned
Unicode data, because later data may reuse it under another quantity.

`intl:usage` and `intl:cldr` are mutually exclusive on one formatter because they select the same
canonical quantity/usage identity. Supplying both is a focused diagnostic rather than an alias
agreement check. `intl:usage="default"` cannot activate a formatter because it establishes no
quantity, but a complete selector such as `intl:cldr="length/default"` can activate the component
and use source-locale policy to infer its source unit. Authors who already know that unit normally
write only `intl:unit`, which implies default usage.

Inside `intl:message`, a unit formatter lowers to one typed placeholder containing its canonical
quantity/usage pair, resolved source unit, value binding, and presentation options. The surrounding
message owns prose such as `Only` and `from the airport`; the nested formatter owns the complete
source fallback range such as `5 miles`. Translations can reorder the placeholder without gaining
access to its reactive expression or changing its physical quantity.

The compiler canonicalizes accepted friendly spellings such as `kilometers` to the corresponding
Unicode unit identifier `kilometer`, diagnoses unknown or ambiguous names, records the physical
quantity, and emits source-unit metadata with the numeric placeholder. Dynamic unit identifiers must
be a finite compiler-proven union whose members have compatible value contracts.

### CLDR selectors and semantic usage vocabulary

`intl:cldr` exposes Unicode's own quantity and usage identifiers in their data-model order. The `/`
is eXact source syntax joining the two separately modeled CLDR coordinates; it is not part of either
Unicode identifier. The compiler validates both coordinates against the package's pinned Unicode
data and retains the canonical pair in formatter metadata:

```tsx
<_ intl:cldr="length/rainfall">{this.state.rainDepth}</_>
<_ intl:cldr="speed/rainfall">{this.state.rainRate}</_>
<_ intl:cldr="length/person-height">{this.state.height}</_>
<_ intl:cldr="mass/person">{this.state.mass}</_>
```

`intl:usage` exposes a finite, globally unambiguous eXact vocabulary. Its names favor the concept an
author is expressing rather than preserving Unicode quantity terminology or word order. Each alias
normalizes immediately to the same canonical CLDR pair accepted by `intl:cldr`. The initial mapping,
subject to the Unicode version pinned for implementation, is:

| eXact `intl:usage`            | Canonical CLDR pair           |
| ----------------------------- | ----------------------------- |
| `area-floor`                  | `area/floor`                  |
| `area-geographic`             | `area/geograph`               |
| `area-land`                   | `area/land`                   |
| `concentration-blood-glucose` | `concentration/blood-glucose` |
| `consumption-vehicle-fuel`    | `consumption/vehicle-fuel`    |
| `duration-media`              | `duration/media`              |
| `energy-food`                 | `energy/food`                 |
| `length-focal`                | `length/focal-length`         |
| `length-person`               | `length/person`               |
| `height-person`               | `length/person-height`        |
| `distance-road`               | `length/road`                 |
| `dimension-vehicle`           | `length/vehicle`              |
| `distance-visibility`         | `length/visiblty`             |
| `rain-depth`                  | `length/rainfall`             |
| `rain-rate`                   | `speed/rainfall`              |
| `snow-depth`                  | `length/snowfall`             |
| `snow-rate`                   | `speed/snowfall`              |
| `mass-person`                 | `mass/person`                 |
| `power-engine`                | `power/engine`                |
| `pressure-barometric`         | `pressure/baromtrc`           |
| `speed-wind`                  | `speed/wind`                  |
| `temperature-weather`         | `temperature/weather`         |
| `volume-fluid`                | `volume/fluid`                |
| `volume-oil`                  | `volume/oil`                  |
| `volume-vehicle-fuel`         | `volume/vehicle`              |
| `age-person`                  | `year-duration/person-age`    |

The mapping is versioned inside `@exactjs/intl`, participates in completion and diagnostics, and
insulates ordinary authored code from upstream label collisions or less approachable standard
terminology. Applications and translations cannot redefine an alias to mean a different canonical
pair. Catalog extraction, formatter metadata, source-unit overrides, and runtime lookup retain only
the canonical pair, so `intl:usage="distance-road"` and `intl:cldr="length/road"` never create two
catalog identities.

### Source-unit inference

For a selector-only formatter, the compiler resolves the canonical source unit in this order:

1. an explicit `intl:unit` at the formatter boundary;
2. a unit carried by a compiler-recognized typed measurement value;
3. the owning package's pinned `sourceUnits[quantity/usage]` override;
4. the versioned eXact source-unit convention for that package's `sourceLocale` and canonical CLDR
   pair;
5. a diagnostic requiring an explicit unit or package override.

The source-locale convention is a fixed input-unit convention, not Unicode's magnitude-sensitive
destination preference. Tooling materializes the resolved canonical unit into compiler metadata so
a consuming application's development or runtime locale can never reinterpret the stored number.
A package whose data contract differs from its locale convention pins an override:

```json
{
	"sourceUnits": {
		"length/road": "kilometer",
		"temperature/weather": "celsius"
	}
}
```

Changing a package source locale, source-unit override, or convention-data version is a semantic
rebuild that may change normalized message identity and requires catalog revalidation. The compiler
must not silently choose a source unit when the package locale lacks enough region information or
the usage has no stable convention.

Formatting and conversion are separate operations:

- without conversion policy, the formatter localizes the numeric value and source-unit display;
- `intl:usage` or `intl:cldr` requests locale-, region-, magnitude-, and purpose-appropriate
  destination selection;
- `intl:to-unit` explicitly selects a compatible destination unit; and
- display, notation, precision, rounding, sign, and grouping props control presentation without
  changing the stored source value.

The first delivery follows this destination-unit precedence:

1. an authored `intl:to-unit`, which expresses a fixed application/domain requirement;
2. an explicit application or user unit preference permitted by that requirement;
3. a compatible target-catalog formatter instruction;
4. Unicode CLDR unit preferences for the resolved locale/region, usage, and magnitude; and
5. the authored source unit.

Configuration must distinguish a fixed `to-unit` from a preference that users may override. A
translation can request a culturally appropriate destination or mixed-unit presentation, but build
validation restricts it to the same physical quantity. A length cannot become a mass, an absolute
temperature cannot silently become a temperature delta, and incompatible compound dimensions are
diagnostics.

`@exactjs/intl` owns a versioned, tested conversion engine and the selected Unicode conversion and
unit-preference data. It must support:

- multiplicative and offset conversions, including temperature;
- compatible compound units;
- locale-preferred mixed units such as feet and inches;
- magnitude thresholds used by a usage such as road distance;
- negative values using the standard absolute-magnitude preference selection while preserving sign;
- rounding only after conversion and destination selection; and
- plural-sensitive display based on the final displayed quantity.

Unit selection cannot be delegated to `Intl.NumberFormat`: that API formats a number with a supplied
unit but does not choose or convert the unit. Browser `Intl` formatting may be used after the package
has selected and converted the value. Server and client artifacts must use the same conversion-data
version, unit policy, locale resolution, and catalog fingerprint.

Custom/private units require an application-configured finite conversion and display contract. They
receive no automatic dimensional relationship merely because their names look similar. Conversion
tables are build inputs, not translator-authored executable functions.

Relevant standards:

- [Unicode LDML unit identifiers, conversion, and preferences](https://www.unicode.org/reports/tr35/tr35-general.html#Unit_Preferences)
- [Unicode supplemental unit conversion and preference algorithms](https://www.unicode.org/reports/tr35/tr35-info.html#Unit_Preferences)
- [Unicode MessageFormat unit formatter model](https://www.unicode.org/reports/tr35/tr35-messageFormat.html)

## Compiler-owned message contract

Internationalization components identify their finite roles through a framework-owned, inert type
contract. The compiler validates the canonical role brand and public prop contract without executing
the package. Roles include message boundary, structural fragment, number, currency, unit, date,
time, relative time, list, plural selector, and exact selector.

For each reachable marked region, compiler output includes portable facts equivalent to:

```ts
interface CompiledMessageDescriptor {
	readonly owner: string;
	readonly key: string;
	readonly canonicalSource: string;
	readonly sourceLocale: string;
	readonly parameters: readonly MessageParameterDescriptor[];
	readonly plan: MessagePlan;
	readonly sourceRange: SourceRange;
}
```

The exact ABI remains internal and versioned. It must retain:

- normalized identity and optional context;
- source fallback plan;
- placeholder types and reactive expression bindings;
- selector and branch structure;
- formatter roles and options;
- safe structural slot ownership;
- component and artifact ownership;
- source locale and required Unicode-data capabilities; and
- placement facts needed by SSR, hydration, lazy activation, refresh, and resumption.

The compiler does not read translated catalogs to decide component correctness. A shared catalog
validator consumes compiler-emitted contracts during the build and reports translation mismatches
through source-linked diagnostics. Direct compiler hosts may request message metadata as ordinary
output without loading a plugin registry.

## Catalogs and component libraries

Compilation emits message fragments beside the component/artifact metadata already consumed by
bundlers. A published component library may include:

- canonical source message contracts;
- source-locale fallback plans;
- any number of package-owned translated catalogs for the components it publishes;
- catalog format/version metadata; and
- provenance connecting every message to the compiled component owner.

It does not require a consuming application to include the internationalization enhancement or host
plugin. The final application chooses whether to link those optional capabilities.

Package participation is static and declarative. A representative manifest shape is:

```json
{
	"exact": {
		"internationalization": {
			"schemaVersion": 1,
			"sourceLocale": "en-US",
			"sourceUnits": {
				"length/road": "mile",
				"temperature/weather": "fahrenheit"
			},
			"messages": "./intl/messages",
			"catalogs": {
				"de": "./intl/de",
				"es": "./intl/es",
				"fr": "./intl/fr"
			}
		}
	},
	"exports": {
		"./intl/messages": "./dist/intl/messages.json",
		"./intl/de": "./dist/intl/de.json",
		"./intl/es": "./dist/intl/es.json",
		"./intl/fr": "./dist/intl/fr.json"
	}
}
```

The precise manifest field names remain subject to package-protocol review, but the contract must
use bounded public package subpaths rather than arbitrary filesystem traversal. Catalog declarations
are data publication, not framework-plugin entries: discovering a component library's declared
catalog must not execute that library, prepare a plugin registry, or grant server trust.

The bundler considers a library catalog only after the resolved library participates in the
application graph, and includes only entries reachable from components present in the responsible
artifact. Installing a library that ships twenty locales must not add those locales or messages to
an application that selected three locales and uses one component. Package-content and release
checks verify that every declared source contract and catalog subpath is published.

A library owns the quality and completeness of the translations it ships. Its CI can validate every
catalog against the same compiled contracts used by applications. Consumers may accept those
translations, omit selected package locales, or override individual entries without forking the
component package.

Every package that owns authored messages declares its own source locale independently. A component
graph may therefore contain source plans authored in several languages. Source locale belongs to
the message owner; importing that package does not establish a nested locale provider or force its
source locale onto descendants.

The application build merges reachable catalogs with deterministic precedence:

1. explicit application overrides;
2. application catalogs;
3. component-library catalogs;
4. compiler-emitted source fallback.

Overrides match canonical owner plus normalized key and must satisfy the emitted placeholder,
selector, formatter, unit-dimension, and structural-slot contract. Catalog adapters may support
MessageFormat 2, XLIFF, JSON, or translation-service interchange, but all adapters lower into one
validated eXact message IR. Runtime catalog entries contain bounded data, not parser source or code.

The bundler includes only messages, locale data, unit data, and formatter capabilities reachable
from each artifact. Lazy components and islands receive separate locale fragments. Component
libraries do not force all supported locales or all Unicode conversion data into an application
bundle.

## Locale resolution and reactive changes

Internationalization distinguishes three locale roles:

- **source locale** belongs to each message-owning package and identifies the language of its
  authored fallback, source plural interpretation, and implicit source-unit conventions;
- **development locale** belongs to a development render entry and is the target locale requested
  from every package participating in that preview; and
- **resolved runtime locale** belongs to an application render root and is selected from route,
  cookie, header, user, and application policy for the current render.

The framework plugin resolves a complete root locale environment rather than exposing only the first
raw `Accept-Language` value:

```ts
interface LocaleEnvironment {
	readonly locale: string;
	readonly region: string;
	readonly direction: 'ltr' | 'rtl';
	readonly timeZone: string;
	readonly calendar?: string;
	readonly numberingSystem?: string;
	readonly unitPreferences?: Readonly<Record<string, string>>;
	readonly catalogFingerprint: string;
}
```

Applications configure supported locales, source locale, fallback order, route/cookie/header
negotiation, time-zone policy, catalog sources, missing-message policy, and optional user-preference
integration. Request locale is an input to negotiation, not an unvalidated catalog identifier.

### Development-root locale

A generated development, component-preview, test, example, or local-SSR entry determines its owning
package. Unless explicitly overridden, that package's `sourceLocale` becomes the development
locale:

```ts
const developmentLocale = configuredDevelopmentLocale ?? developmentEntryPackage.sourceLocale;
```

This is root tooling policy, not a component-authored nested context. A dependency retains its own
message owner and source locale, but lookup targets the development root's locale. The resolver
builds an ordered target chain such as `fr-CA`, `fr`, then configured application fallbacks. For
each target candidate it checks a development/application override for that owner, then the
component library's packaged catalog. If no candidate resolves, it executes the component library's
compiler-emitted source plan in its own declared source locale.

The dependency's source locale never creates an implicit provider around its component. Rendering
the German library directly under its own development entry defaults to German; rendering the same
component through an English package's development entry requests its packaged English translation.
If no English translation exists, the component honestly falls back to German and produces the
configured missing-translation diagnostic.

An explicit development-locale override supports translation, RTL, pseudo-locale, and unit-policy
preview without lying about the language in which the package's own source messages were authored:

```ts
intl: {
	developmentLocale: 'ar-EG';
}
```

Development locale does not change normalized message keys, message ownership, compiled source-unit
meaning, package source locale, or production locale negotiation. Changing the development locale
invalidates only the development catalog/data plan and affected rendered consumers.

The resolved environment is provided through ordinary request/application/component context. The
initial catalog is ready before SSR or client-only root rendering begins, so ordinary message
formatting is synchronous. A locale change loads and validates the needed catalog fragments inside
an ordinary task, then atomically publishes the new locale environment. Only reactive message and
formatter consumers update.

The page root may use that one root context to author `<html lang>` and direction, title composition,
or route policy. Package boundaries do not add nested contexts, and internationalization does not
require a second global state system.

## Performance and artifact-memory constraints

Internationalization must consume the runtime baseline established by
[`javascript-performance-improvements.md`](javascript-performance-improvements.md), not introduce a
parallel reactive or child-ownership system.

- Compiled message descriptors are build-owned immutable data. Runtime message instances retain a
  compact descriptor identity and active parameter bindings, not a copied canonical source,
  source-range record, complete branch plan, or package catalog.
- Catalogs and Unicode conversion/format data are split by artifact, owner, locale, and capability.
  A process may share immutable validated generations, but caches require explicit byte/count
  bounds and generation-aware eviction.
- Formatter instances are shared by canonical locale/options/data-version keys with a bounded
  cache. A message or unit enhancement must not create a formatter per render or retain converted
  transient values after publication.
- Source fallback without the optional enhancement creates no message component, message context,
  descendant contribution table, formatter cache entry, or full effect scope beyond the ordinary
  authored fallback tree.
- If cooperative structured children are accepted, message slots reference the existing compiled
  cells and committed ranges. They do not materialize a second `children.graph`, clone VNodes, or
  retain inactive branch output merely to preserve a translation slot.
- Locale/catalog replacement releases the prior generation once no active SSR request, hydrated
  root, lazy artifact, refresh, or resumption checkpoint can reference it. Package catalogs must not
  become permanently process-global merely because their package was encountered once.
- Compiler and language-tool message analysis should publish compact projections and participate in
  the language-service cache bounds rather than keep duplicate source text and full message plans
  for every closed file.

Message parameters and structural branches should occupy ordinary compiler render-plan slots so
formatting can publish directly to the affected text/range without reconstructing a message VNode
tree. Locale/catalog generation changes invalidate active consumers through their registered owner
and descriptor identities; they must not scan all mounted components or every package catalog.
SSR formatting should write into the request chunk writer, and lazy client artifacts should load
only the locale, formatter, Unicode-data, and message fragments reachable from that artifact.

Verification must measure inactive fallback, active message-heavy lists, locale changes, package
catalog churn, SSR concurrency, hydration, and lazy-artifact release. Report retained heap and peak
heap together with formatting/update latency, SSR throughput, hydration time, and bundle/catalog
bytes; reducing one by shifting the same data into another long-lived cache or broad invalidation is
not a win.

## SSR, hydration, lazy artifacts, refresh, and resumption

SSR and hydration use the same resolved root locale, per-owner source locales, selected package
translations, catalog fingerprint, Unicode-data version, unit-preference policy, and
component-library authorization result. The server serializes only bounded public locale identity
and artifact references, never an executable formatter or unbounded catalog embedded in hydration
data.

Hydration adopts server-rendered message ranges before activating client enhancement instances. A
catalog or policy mismatch follows normal hydration diagnostics and recovery; the client must not
silently re-negotiate a different initial locale and mutate text during adoption.

Lazy artifact plans pair code with the exact locale/message/unit-data fragments needed by that
artifact. Loading a lazy component under an existing locale fetches its matching fragment. Changing
locale invalidates or reloads only active catalog consumers and preserves component/DOM identity
when the translated structural-slot contract permits an in-place update.

Structural refresh plans treat translated branch selection and structural-slot ordering as
compiler-owned range structure. A refresh may update text or reorder authorized slots only within
the message plan; it cannot patch through component ownership or inject translator-defined markup.

Partial-prerender checkpoints retain opaque locale/catalog/data fingerprints and active message-plan
identities, not translated strings as durable operation identity. Resume reacquires the exact
authorized catalog generation or fails closed to the nearest safe rerender boundary.

Microfrontend exposures publish message/catalog requirements through the shared artifact plan.
Page and component hosts agree on locale, catalog protocol, owner identity, Unicode-data version,
and provided `@exactjs/intl` instance before hydration. Remote catalogs cannot override unrelated
owners without an explicit application policy.

## Trust and security

Internationalization enhancement implementations are ordinary component-library code. If selected
into a server-executing artifact, the bundler applies the server component-library trust policy
before evaluation. Catalog data alone does not authorize or execute a component package.

Framework-plugin discovery and trust separately govern host projections that read catalog files,
configuration, request data, or translation-service adapters. The compiler performs no trust
decision and runs no plugin callback.

Catalog validation must enforce:

- bounded message, branch, nesting, locale, and catalog sizes;
- exact placeholder availability and compatible types;
- complete selector fallback;
- compatible formatter and unit dimensions;
- finite structural slots owned by authored code;
- no HTML/script interpretation or arbitrary URL/attribute mutation;
- bidi isolation for substituted values where required;
- no server-only or secret value entering a client message parameter; and
- no filesystem path, package path, or source excerpt exposed as runtime identity.

Machine-generated or remotely supplied translations are untrusted data and pass the same build-time
and runtime boundary validation as local catalogs.

## Diagnostics and language tools

Compiler and language-tool support should provide:

- completion and hover for finite `intl:*` activators and shared formatter props;
- canonical unit, currency, date/time, list, selector, semantic usage alias, and CLDR
  `<quantity>/<usage>` values;
- source-unit inference provenance showing typed, explicit, package, or source-locale convention;
- diagnostics for malformed formatter children and unsupported branch predicates;
- inferred placeholder names/types and normalized-key inspection;
- source-linked missing, obsolete, incompatible, or duplicate translation diagnostics;
- package-owned catalog provenance, coverage, override origin, and published-subpath diagnostics;
- development-entry locale, dependency translation selection, and per-owner source fallback;
- catalog reachability and artifact ownership inspection;
- locale/unit preview without mutating source; and
- pseudo-locale preview for expansion, bidi, and structural-slot stress.

The language server follows its existing workspace trust boundary. It does not contact translation
services or execute workspace plugin code merely to provide message semantics.

## Testing strategy

Testing support should allow a component or application test to install a locale environment and
catalog explicitly. Source-fallback tests require no plugin host. Provide deterministic
pseudo-locales that expand text, preserve placeholders, exercise combining characters, and mirror
direction without altering component identity.

Verification must cover:

- normalized identity stability across formatting, source paths, and local variable renames;
- intentional key changes for semantic text, context, branch, formatter, and unit changes;
- placeholder typing, reuse, structural slots, and catalog compatibility;
- source-local behavior with missing translations and unavailable enhancements;
- scalar formatter fallbacks that retain authored unit presentation when unavailable and replace
  the complete annotated range without duplicating source labels when active;
- mixed-source-locale package graphs whose development entry selects dependency translations without
  introducing package-nested locale contexts;
- direct `_` enhancement composition with text, branches, and multi-node output;
- plural/select branch analysis, locale-specific categories, and unsupported predicates;
- number, currency, date/time, relative, list, and bidi formatting;
- unit aliases, dimensional validation, offset/compound/mixed conversion, thresholds, user policy,
  semantic alias and CLDR-pair normalization, selector-only source inference, translation overrides,
  rounding, and negative values;
- identical SSR/hydration locale, catalog, unit data, and output adoption;
- lazy locale fragments, locale-switch cancellation, stale generation fencing, and cleanup;
- refresh, partial resumption, and heterogeneous microfrontend catalog agreement;
- unauthorized server component-library and plugin rejection before evaluation;
- adversarial catalog size, nesting, HTML, slot, unit, and placeholder inputs; and
- package fixtures whose own source and translated catalogs are published, selectively linked,
  overridden by an application, omitted when unreachable, and rejected when their manifest or
  package contents disagree.

## Delivery order

1. Define the browser-safe message IR, formatter roles, normalized identity, and catalog validation
   contracts.
2. Extend compiler and language tools with the finite internationalization role brands, message
   regions, scalar formatters, structural slots, and pure select/plural branch analysis.
3. Implement explicit source-local components and enhancement export maps over one shared runtime.
4. Add per-package source locale/unit conventions, catalog extraction, component-library publication
   metadata, application override merging, missing/obsolete diagnostics, and pseudo-locales.
5. Implement versioned Unicode unit conversion/preferences with artifact-level data slicing and
   adversarial conformance tests.
6. Add framework-plugin configuration and build/server/render/client/testing projections without a
   compiler callback surface.
7. Coordinate development-entry locale selection, dependency translation lookup, runtime locale
   negotiation, SSR, hydration, reactive locale changes, lazy catalog fragments, and generation
   fencing.
8. Integrate structural refresh, partial-prerender resumption, and microfrontend artifact contracts.
9. Add current engineering references, package READMEs/local agent guidance, docs-app pages,
   examples, and translation-tool adapter documentation when implementation lands.

## Acceptance criteria

1. Components can author complete messages and formatted values through `intl:*` enhancements on
   intrinsic elements and `_` fragments without manual message IDs or formatter calls.
2. Authored JSX remains the direct local and unavailable-enhancement behavior; an active missing
   translation executes the compiler-emitted source plan.
3. Normalized semantic source plus optional context determines the catalog key, remains stable
   across source relocation and local renaming, and intentionally changes with message meaning.
4. Plural and select regions lower compiler-proven ordinary code branches into translation-owned
   selector plans while preserving authored source execution.
5. Explicit components and enhancement forms share ordinary inspectable component implementations,
   context, tasks, ownership, placement, cleanup, and message IR.
6. Published component libraries can carry message contracts and package-owned translations for
   their components without requiring consuming applications to activate the enhancement or
   framework plugin; consuming builds link only selected locales and reachable messages and retain
   deterministic application override authority.
7. The compiler emits portable message metadata without reading catalogs, loading plugins, deciding
   trust, or executing package callbacks.
8. The bundler emits only reachable per-locale/per-artifact catalogs, formatter code, and Unicode
   data, including independently loaded lazy fragments.
9. Each package owns an independent source locale; a development entry defaults its one root target
   locale from the entry package and resolves dependency translations for that target without adding
   component-level locale providers.
10. `intl:unit` implies default usage, while either a globally unique `intl:usage` alias or an exact
    `intl:cldr="<quantity>/<usage>"` selector activates the same unit component and can omit
    `intl:unit` when typed, package, or source-locale policy resolves a canonical source unit at
    compile time; both selector forms normalize to one metadata and catalog identity.
11. A scalar formatter accepts one reactive value plus optional static source-locale fallback
    presentation; unavailable enhancements retain that authored range, while active formatters
    replace it as one typed placeholder without duplicated unit text.
12. Unit formatting always records that resolved source unit, performs only dimensionally valid
    conversion, uses explicit/application/translation/CLDR destination policy deterministically,
    and supports mixed and offset units where the selected Unicode data defines them.
13. Currency formatting never performs implicit exchange-rate conversion.
14. SSR, hydration, locale changes, refresh, resumption, and microfrontends agree on locale,
    catalog, Unicode data, authorization, ownership, and generation identities.
15. Translator-controlled data cannot inject executable code, HTML, component identity, props,
    handlers, URLs, secrets, or unauthorized structural output.
16. Server-executing internationalization components and host projections pass their respective
    component-library and framework-plugin trust boundaries before evaluation.
17. Compiler, language-tool, runtime, conversion, bundler, SSR, hydration, lazy, refresh,
    resumption, microfrontend, security, package, and documentation verification passes.

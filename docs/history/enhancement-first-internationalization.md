# Enhancement-first internationalization

## Status

**Implemented and archived in August 2026.** The native analyzer, runtime, shared host
coordination, published catalogs, interchange, capability providers, locale fallback/lazy
generation adoption, and bounded unit policy are executable and pass the architecture gate, but
their internal protocol-1 artifacts remain versioned build contracts rather than application APIs.
Current behavior is authoritative in
[`internationalization.md`](../internationalization.md). This record follows
[`enhancements-as-component-composition.md`](enhancements-as-component-composition.md) and
[`server-component-library-trust.md`](server-component-library-trust.md). It no longer depends on
[`cooperative-structured-children.md`](../proposals/cooperative-structured-children.md). Messages are
lexically owned regions: analysis follows locally authored intrinsic and finite branch structure,
but ordinary component invocations remain opaque unless source marks them as structural slots or
they publish a finite internationalization role. That boundary removes the need for general
runtime child inspection, child capability injection, or application-wide component expansion.
This implemented contract remains a settled input to
[`lazy-interaction-islands.md`](lazy-interaction-islands.md),
[`webpack-bun-microfrontend-parity.md`](webpack-bun-microfrontend-parity.md). The implemented
[`component-value-callback-bindings.md`](component-value-callback-bindings.md) contract is
not an internationalization prerequisite, but its callback and intrinsic-adapter analysis is now
part of the settled compiler baseline that precedes broader lazy-island delivery.

The enhancement proposal supplies finite activator maps, optional ordinary-component activation,
direct `_` composition boundaries, and semantic `_target` routing. The trust proposal authorizes
any selected component-library implementation before it enters a server-executing artifact. This
proposal adds an internationalization-owned build analyzer/linker, an official component library
and enhancement surface, portable message and projection artifacts, and an explicit bundler option
backed by one shared cross-host coordinator. The standard component compiler remains unaware of
message, catalog, translation, unit-policy, and CLDR semantics. It does recognize proven native
ECMA-402 construction and locale-string operations as a general allocation optimization, lowering
them to core's contextual or global cache facade.

| Concern                         | Owner                                                         |
| ------------------------------- | ------------------------------------------------------------- |
| Authored source fallback        | Ordinary TSX, branches, expressions, and `_` fragments        |
| Message and formatter analysis  | `@exactjs/intl` build analyzer over lexical message regions   |
| Optional translated rendering   | `@exactjs/intl` ordinary components and enhancements          |
| Catalog and locale coordination | Shared Vite, Bun, and Webpack host coordinator                |
| Unit conversion and preferences | Versioned `@exactjs/intl` Unicode data and application policy |
| Package execution trust         | Bundler-enforced server component-library policy              |
| Build analyzer execution trust  | Explicit host activation of the fixed native analyzer         |
| Translation identity            | Generic text/placeholders plus an optional readable name      |
| Execution identity              | Separately hashed exact binding and formatter contract        |

## Decision

Add enhancement-first internationalization whose authored content remains directly executable when
translation support or a translated catalog is absent. Components opt specific message regions and
formatted values into analysis through the standard namespaced enhancement syntax. A bundler-owned
internationalization analysis/link phase emits normalized, typed, portable message and projection
artifacts without extending the standard compiler with internationalization semantics.

The final application may include the official internationalization enhancement components,
analyzer/linker, and host option. When present, they resolve translated message plans,
coordinate the same locale and catalog across SSR and hydration, split catalogs with the
component/artifact graph, and format or convert typed values. When absent, the authored target or
`_` fragment remains unchanged under the normal enhancement fallback contract.

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
- Keep each message lexically owned by one explicit intrinsic or `_` boundary; never make its key
  depend on recursively rendered ordinary component implementations.
- Analyze complete finite local control flow, including nested intrinsic branches, without choosing
  a runtime branch during the build.
- Make message extraction, placeholder typing, branch recognition, catalog reachability, and
  server/client agreement analyzer- and bundler-checkable.
- Use normalized semantic source messages as catalog keys rather than mandatory authored IDs.
- Express numbers, currencies, semantic units, dates, times, lists, relative values, display names,
  pluralization, and selection through ordinary enhancement composition or analyzer-proven source
  projections.
- Translate a finite allowlist of authored intrinsic properties through the same message and
  formatter IR used for content.
- Recover formatter intent from ordinary typed values and finite pure fallback logic, including
  ranges, ordinal presentation, Temporal durations, and relative-duration selection.
- Convert units automatically when locale, usage, magnitude, and application/user policy indicate a
  different destination unit.
- Keep currency conversion, translation services, and application content policy outside the
  formatter runtime.
- Preserve setup-once component ownership, expression-level reactivity, inspectable enhancement
  instances, deterministic cleanup, and artifact-local server/client coordination.
- Add no runtime child inspection, VNode cloning, hidden-source mounting, or cooperative
  parent/child registration protocol.

## Non-goals

- Automatically treating every JSX text node as translatable.
- Requiring a translation-management vendor, catalog file format, or network service.
- Executing translator-provided JavaScript, HTML, components, URLs, or event handlers.
- Allowing host integration to register arbitrary compiler visitors, transforms, directives, or
  parser callbacks.
- Recursively expanding ordinary component implementations into an enclosing message.
- Translating arbitrary runtime-generated strings, unbounded lists, or effectful child factories.
- Treating `_target` as authority to inspect or rewrite an opaque component's internal content.
- Inferring currency exchange rates or converting monetary value between currencies.
- Making locale the owner of application data, component state, routing, or user preferences.
- Hiding source-message changes behind compatibility keys or migration aliases.

## Package and host boundaries

The first delivery should separate browser-safe authoring/runtime contracts from host integration:

- `@exactjs/intl` owns explicit components, enhancement exports, locale/message runtime contracts,
  formatter implementations, unit conversion, and versioned Unicode data needed by selected
  artifacts;
- an inert browser-safe contract entry owns analyzer-recognizable role declarations and portable
  message/projection types without importing host code;
- the internationalization analyzer/linker recognizes that finite contract and emits portable
  facts without executing component implementations; and
- `@exactjs/intl-build` owns catalog adapters, configuration, locale
  negotiation policy, build projection, render/server/client coordination, and testing projection.

The component/enhancement and host-coordination surfaces are independently activated. Importing an
internationalization enhancement does not enable build analysis or catalog coordination. Enabling
the bundler option does not make unmarked component content message-owned.

The shared coordinator translates validated configuration into analyzer/linker options and consumes
emitted message metadata. It does not install callbacks into standard compiler analysis. The
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

When a readable purpose makes catalogs easier to scan, the string value of `intl:message` supplies
an optional message name directly:

```tsx
<_ intl:message="navigation">Home</_>
```

The string is a concise name, not a complete handwritten catalog key or replacement for the source
message. The analyzer normalizes it as the readable key prefix and appends the full translation
contract hash, so reusing a name for different content cannot collide.

Use `_` when the message is inline, structural, or should not add an intrinsic element:

```tsx
<p>
	<_ intl:message>Welcome, {this.props.name}.</_>
</p>
```

The message owns only the content lexically authored inside that intrinsic or `_` boundary. The
internationalization analyzer does not descend through ordinary component invocations or discover
text from their rendered output. An active intrinsic message preserves the authored host element
and projects only its owned content range. An active enhancement on `_` occupies that fragment
boundary. An unavailable enhancement leaves the intrinsic or transparent fragment unchanged.

`intl:message` is not initially valid on an ordinary component invocation:

```tsx
<Card intl:message>Welcome, {this.props.name}.</Card>
```

The analyzer cannot assume that `Card` renders its children exactly once or exposes them as its
semantic content. Put the boundary around the caller-owned content instead:

```tsx
<Card>
	<_ intl:message>Welcome, {this.props.name}.</_>
</Card>
```

`_target` may identify the semantic intrinsic that receives normal enhancement property, event,
ref, and styling contributions. It does not authorize internationalization to inspect or replace an
opaque component's internal content.

### Role grouping and semantic hosts

`message` establishes an explicit lexical message boundary. `plural` and `select` contribute their
selectors to the nearest such boundary; when neither has an enclosing message, it synthesizes that
boundary for its own range. Co-targeted forms and nested formatter or selector roles therefore lower
to one canonical `IntlMessage` plan, descriptor, and catalog unit rather than mounting independent
message components.

Content-projecting intl roles are initially valid only on a direct intrinsic or `_` boundary. On an
intrinsic, the authored element remains the semantic host and the intl role owns only its lexical
content projection. On `_`, the role owns the transparent fragment range. An intl implementation
may use ordinary `_target` contributions to observe or augment an intrinsic host, but translated
projection remains separately bounded to the analyzer-declared content range.

Formatter activators select their corresponding canonical formatter components. `unit` and `cldr`
select one canonical Unit component: `unit` exposes eXact's semantic vocabulary and `cldr` exposes
the exact Unicode quantity/usage pair. `display-name` selects the display-name formatter.
`fragment` is a nested message-slot role rather than a standalone message or formatter. Finite
property-message activators such as `aria-label` and `placeholder` select one canonical
`IntlAttributes` component and project only their corresponding intrinsic properties. None of
these roles makes an ordinary component invocation transparent.

Property-message activators are valid only on a direct intrinsic and require the corresponding
authored fallback property on that same element. `_target` does not permit `intl:aria-label` or a
similar role on an ordinary component invocation to reach through and claim a descendant intrinsic.

Only explicitly marked regions enter a catalog. Unmarked text remains ordinary application
content, including text rendered by an ordinary descendant component.

### Lexical ownership and traversal

Within one message boundary the analyzer follows:

- static JSX text and punctuation;
- effect-free scalar expressions as typed placeholders;
- statically typed Temporal and measurement values;
- fragments and `_` boundaries;
- locally authored intrinsic elements and their children;
- finite local conditional and exact-selection branches;
- finite pure local value producers whose results flow into the marked region;
- explicit plural/select regions; and
- declared internationalization formatter and structural-fragment roles.

It stops at an ordinary component invocation, arbitrary child-producing function call, opaque
dynamic component, unbounded content-producing list, portal, unsafe HTML, or another construct whose
finite lexical content and ownership cannot be proven. An ordinary component may participate only
as one explicit structural slot; its implementation and descendants remain a separate translation
domain.

General `props.children` cannot supply source prose for an enclosing message because its lexical
content belongs to callers. It may appear only as an explicitly named opaque structural slot:

```tsx
function Notice(props: { children: Child }) {
	return () => (
		<_ intl:message>
			Important: <_ intl:fragment={'details'}>{props.children}</_>
		</_>
	);
}
```

The enclosing message is `Important: {details}`. Caller-owned text inside `details` is not absorbed
into that message and must carry its own message boundary when it needs translation. A message whose
only meaningful source content is unconstrained `props.children` is a diagnostic; place that
message boundary at the call site instead.

### Formatted values

Formatter activators and their children jointly describe semantic source information. The fragment
child supplies the reactive value or finite value shape; authored fallback presentation, an
activator value, or a finite options object supplies a currency, semantic measurement purpose,
exact CLDR pair, or presentation option when required:

```tsx
<_ intl:number>{this.state.count}</_>

<_ intl:currency>${this.state.total}</_>

<_ intl:currency>{this.state.total} USD</_>

<_ intl:unit="distance-road">{this.state.distance} miles</_>

<_ intl:cldr="length/road">{this.state.distance} miles</_>

<_ intl:unit="distance-road">
	{this.state.minimumDistance}-{this.state.maximumDistance} miles
</_>

<_ intl:date intl:style="long">{this.props.createdAt}</_>

<_ intl:list intl:style="long">{this.props.participants}</_>
```

The same formatter roles may own the complete lexical content of an intrinsic while preserving the
host element and its authored properties:

```tsx
<output intl:number>{this.state.count}</output>

<time dateTime={this.props.createdAt.toISOString()} intl:date intl:style={'long'}>
	{this.props.createdAt}
</time>

<span intl:unit={'distance-road'}>{this.state.distance} miles</span>
```

The intrinsic is not cloned or replaced merely to format its contents. Its ordinary props, events,
refs, ownership, and `_target` contribution layers remain attached to the same host generation.
The formatter projection replaces only the analyzer-declared content range. Formatter activators
remain invalid on ordinary component invocations unless that invocation is itself a published intl
role component.

The activator selects its mapped ordinary component. `unit` and `cldr` map to the same Unit
component and are mutually exclusive semantic selectors for that instance. Other namespaced
attributes are distributed as ordinary props according to the finite activator/component contracts
established by the enhancement proposal. The intl analyzer validates that the fragment contains the
value shape required by the selected formatter. A formatter may accept one scalar binding, two
compatible range endpoints, one recognized structured value such as `Temporal.Duration`, or a
finite pure decision tree whose leaves have compatible formatter contracts. Source-locale
presentation may include static text and pure finite branches derived from those bindings, such as
singular/plural unit labels. It cannot contain an unrelated reactive binding, effectful evaluation,
or uncontrolled structural output. When active, the formatter replaces the complete annotated
range; it does not append its output beside the authored fallback text.

Formatter fragments compose inside complete messages:

```tsx
<_ intl:message>
	Items: <_ intl:number>{count}</_>.
</_>
```

### Formatter-local plural behavior

Plural-sensitive formatter projections have an implicit, deliberately narrower pluralization
contract. A unit, long-name currency, ordinal, range, duration, or numeric relative-time formatter
may need locale-specific morphology inside the value it owns. Authored fallback content may express
the source locale plainly with a pure ternary over a formatter value binding:

```tsx
<_ intl:unit="distance-road">
	{distance} {distance === 1 ? 'mile' : 'miles'}
</_>
```

The analyzer treats the expression, displayed occurrence, and fallback ternary as uses of one
binding and evaluates it once per update. When the formatter is active, it replaces that complete
range and selects its own locale-correct display form; the fallback ternary is not emitted as a
translator-authored message branch. Range endpoints similarly use locale plural-range rules instead
of two independent selectors. Formatter-local plural behavior therefore adds neither a message
boundary nor an independent selector tree.

The active formatter derives plural operands from the final displayed numeric quantity, including
conversion, destination-unit selection, rounding, and visible fraction digits. This keeps output
such as a converted unit label consistent with the number users see. Server and client must apply
the same operand and formatting rules.

This implicit behavior is confined to the formatted value. If surrounding prose, word order, a
verb, or another placeholder changes with the quantity, the enclosing region still uses
`intl:plural`, as described in the structural-selection section below.

When an enclosing plural message and nested formatter use the same value, they share the
analyzer-proven binding but retain separate responsibilities: the message selects translated
sentence structure, while the formatter produces one localized scalar value.

### Source-inferred formatter projections

Inside an explicit message or property-message boundary, the analyzer considers a value together
with the ordinary fallback code that presents it. Static types provide strong semantic evidence;
adjacent source text, punctuation, standard `Intl` calls, and finite pure control flow refine the
projection. Inference never causes an unmarked string elsewhere in the application to enter a
catalog.

A statically recognized `Temporal.Duration` used directly inside a message becomes a duration
projection without a separate authored component:

```tsx
<_ intl:message>The task took {duration}.</_>
```

The active runtime formats the complete duration through the selected duration-format contract.
The unavailable-enhancement path retains Temporal's ordinary string coercion. Authors use an
explicit Unit boundary only to request a non-default semantic purpose or style:

```tsx
<_ intl:message>
	The task took
	<_ intl:unit="duration-media" intl:style="digital">
		{duration}
	</_>
	.
</_>
```

Other statically recognized Temporal values similarly select date, time, date-time, instant, or
zoned-date-time projections. The analyzer records any required calendar, time-zone, and balancing
context. It recognizes the standard Temporal type contract and approved compatible polyfill types;
runtime correctness must not depend on cross-realm `instanceof` checks. Converting a duration across
calendar-dependent units such as months and days requires an explicit `relativeTo` policy; without
one, formatting preserves the value's authored fields.

Native date/time formatting is itself sufficient projection evidence inside a marked message. An
author does not add `intl:date`, `intl:time`, or another formatter enhancement around a recognized
Temporal value that is already presented by `Intl.DateTimeFormat`:

```tsx
<_ intl:message>
	Published
	{new Intl.DateTimeFormat('en-US', {
		dateStyle: 'long',
		timeStyle: 'short',
		timeZone: 'America/Los_Angeles'
	}).format(publishedAt)}
	.
</_>
```

The analyzer lowers the direct formatter result to one date-time projection. It treats the authored
locale as source-fallback information, retains finite options such as date/time fields, styles,
calendar, numbering system, hour cycle, and time zone, and substitutes the active target locale when
the enhancement is present. The authored native call remains the directly executable fallback.
An explicit locale must agree with the owning package's source-locale contract. An omitted locale is
valid only when build policy proves that the fallback environment default is that source locale;
otherwise analysis diagnoses nondeterministic server/client fallback rather than silently adopting
the host locale.

The same implicit lowering applies to:

- direct callable or constructed `Intl.DateTimeFormat(locale, options).format(value)` forms, with or
  without `new`;
- a locally bound, analyzer-proven `Intl.DateTimeFormat` instance whose construction locale and
  options remain finite;
- its direct `format(value)` result;
- `formatRange(start, end)` over compatible Temporal values, which becomes one date/time range
  projection; and
- the corresponding Temporal `toLocaleString(locale, options)` operation when its locale and options
  satisfy the same source-locale and finiteness rules.

The value's Temporal type supplies the date, time, date-time, instant, calendar, and zone semantics;
the native call supplies presentation options. Locale-sensitive output text and punctuation are not
captured as literal message content. Dynamic formatter construction, mutation or escape of the
formatter object, incompatible range endpoints, arbitrary transformation of formatted output, and
`formatToParts()` assembly that the analyzer cannot prove equivalent remain diagnostics in a marked
region. This recognition belongs to the intl analyzer and does not add `Intl` semantics to the
standard component compiler.

A plain number remains cardinal unless its fallback use proves another meaning. A profiled ordinal
marker partition over one binding can establish an ordinal projection:

```tsx
<_ intl:message>
	You placed {position}
	{position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}.
</_>
```

Superscript fallback presentation establishes the same ordinal intent and must be preserved as a
presentation preference rather than preventing projection inference:

```tsx
<_ intl:message>
	You placed {position}
	<sup>{position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}</sup>.
</_>
```

The analyzer recognizes both a direct semantic `sup` wrapper around an analyzer-proven suffix and
equivalent literal Unicode superscript-letter suffixes. It records baseline versus superscript
suffix presentation separately from the locale's ordinal category. The authored form remains the
exact unavailable-enhancement fallback. An active target locale uses its own ordinal rules and
word order; when that locale produces a suffix, the formatter applies the recorded superscript
preference to that suffix only. It does not superscript the number, manufacture a suffix for a
locale that does not use one, or retain an English suffix beside translated output. Arbitrary CSS
or a class name alone does not establish ordinal intent because its rendered typography is not a
finite source-semantic contract.

The English language profile retains ternary compatibility shorthand, including baseline, semantic
`sup`, and literal superscript suffixes. The registry also includes German, French, Spanish,
Portuguese, Italian, Dutch, Polish, Ukrainian, Russian, Arabic, Hindi, Japanese, Chinese, Korean,
Turkish, and Indonesian profiles. Language profiles are bounded data supplied to a language-neutral
native analyzer; they can register finite ordinal markers and distinctive prefix/value/suffix,
prefix-only, or suffix-only wrappers without adding language branches to traversal or lowering.
This covers forms such as `第{position}位`, `ke-{position}`, `{position}.º`, Hindi suffixes, and
finite Arabic word branches. Ambiguous punctuation alone is not proof. No profile is a universal
source-language parser. For an unrestricted domain or a source without matching shorthand, the
portable form is an ordinary static
`Intl.PluralRules` operation with `type: 'ordinal'` and a finite category-to-literal lookup:

```tsx
const rules = new Intl.PluralRules('en-US', { type: 'ordinal' });
const suffixes = { zero: 'th', one: 'st', two: 'nd', few: 'rd', many: 'th', other: 'th' };

<_ intl:message>
	You placed {position}
	<sup>{suffixes[rules.select(position)]}</sup>.
</_>;
```

The analyzer recognizes the static locale and options as explicit intent and lowers the lookup to
the same ordinal selection IR. It must not infer ordinal intent from a variable name or nearby prose
alone. Target output uses target-locale ordinal plural rules; the authored category strings remain
directly executable fallback presentation rather than universal categories.

The static locale must agree with the package `sourceLocale`. A language-only tag may omit source
specificity (`en` is compatible with `en-US`), but explicitly contradictory language, script, or
region subtags produce a source-linked diagnostic. This validation applies consistently to
recognized `Intl` constructors and native `toLocaleString()` projections. The authored locale
governs only the executable source fallback; a catalog continues to select and format with its
active target locale.

The same finite lookup with the default `cardinal` rules lowers to cardinal selection. This is the
portable source-locale form for category systems that do not fit an English exact-one ternary. The
conformance set includes Arabic's `zero`/`one`/`two`/`few`/`many`/`other`, Polish's
`one`/`few`/`many`/`other`, French's `one`/`many`/`other`, and Hindi's `one`/`other` maps. The
analyzer records the finite authored leaves, while the active runtime selects with the target
locale's native `Intl.PluralRules`.

The analyzer also recognizes a static category lookup keyed by
`rules.selectRange(start, end)`. It records two reactive numeric selector bindings and whether the
rules are cardinal or ordinal. At runtime the target locale performs one native
`Intl.PluralRules.selectRange()` operation and selects one category branch. The plan does not form
the Cartesian product of two independently selected endpoint categories, so translator work stays
bounded to the target locale's plural-range categories.

The implementation treats native `Intl.PluralRules.selectRange()` as part of eXact's modern-browser
baseline rather than adding a client capability provider. An unsupported runtime fails explicitly;
the Temporal and duration-format providers do not claim to supply plural-range behavior.

The difficult duration case is a required capability, not a pattern authors must simplify. The
following finite pure fallback selects one relative-time unit from a `Temporal.Duration`, supplies
source-locale morphology, and retains a literal zero case:

```tsx
<p intl:message>
	Posted
	{Math.abs(duration.years) > 0
		? `${Math.abs(duration.years)} year${Math.abs(duration.years) === 1 ? '' : 's'} ago`
		: Math.abs(duration.months) > 0
			? `${Math.abs(duration.months)} month${Math.abs(duration.months) === 1 ? '' : 's'} ago`
			: Math.abs(duration.weeks) > 0
				? `${Math.abs(duration.weeks)} week${Math.abs(duration.weeks) === 1 ? '' : 's'} ago`
				: Math.abs(duration.days) > 0
					? `${Math.abs(duration.days)} day${Math.abs(duration.days) === 1 ? '' : 's'} ago`
					: Math.abs(duration.hours) > 0
						? `${Math.abs(duration.hours)} hour${Math.abs(duration.hours) === 1 ? '' : 's'} ago`
						: Math.abs(duration.minutes) > 0
							? `${Math.abs(duration.minutes)} minute${Math.abs(duration.minutes) === 1 ? '' : 's'} ago`
							: Math.abs(duration.seconds) > 0
								? `${Math.abs(duration.seconds)} second${Math.abs(duration.seconds) === 1 ? '' : 's'} ago`
								: 'just now'}
</p>
```

The analyzer lowers this to one duration reader and a compact decision plan: choose the first
nonzero authored field in order; format its negative absolute magnitude as past relative time with
the corresponding unit; otherwise select the translated `just now` leaf. It preserves the authored
field priority, does not rebalance `14 months` to `1 year`, and does not reinterpret the duration's
sign. The repeated reads, `Math.abs` calls, source plural suffixes, and `ago` literals do not become
independent reactive readers or Cartesian message cases.

Equivalent ordinary data-flow code is also supported when its complete producer is local and
analyzable:

```tsx
function relativeAge(duration: Temporal.Duration) {
	const units = [
		{ value: duration.years, unit: 'year' },
		{ value: duration.months, unit: 'month' },
		{ value: duration.days, unit: 'day' },
		{ value: duration.hours, unit: 'hour' },
		{ value: duration.minutes, unit: 'minute' },
		{ value: duration.seconds, unit: 'second' }
	] as const;

	const match = units.find((candidate) => Math.abs(candidate.value) > 0);
	if (!match) return 'just now';

	return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(
		-Math.abs(match.value),
		match.unit
	);
}

return () => <p intl:message>Posted {relativeAge(duration)}</p>;
```

The static array, literal unit union, pure `find`, field flow, `Math.abs`, and standard
`Intl.RelativeTimeFormat` call provide the same semantic plan. The formatter locale must be
analyzer-proven compatible with the owning package's source locale and configured source fallback
chain; active target rendering substitutes the resolved target locale.
Local pure helpers may be summarized or inlined for analysis. An imported helper requires a
published intl analyzer contract. Opaque calls, effects, unbounded generated output, dynamic unit
sets, and branches whose finite leaves cannot be proven remain diagnostics inside an explicitly
internationalized region.

These rules make complexity itself acceptable. The actual boundary is a deterministic finite
projection graph with analyzer-proven leaves, not a fixed limit on how many ordinary expressions an
author may use to describe the fallback.

### Intrinsic property messages

A finite set of human-facing intrinsic properties can carry independent message boundaries. The
authored property remains the direct fallback; a corresponding namespaced activator marks that
property for analysis and projects the active translation through `_target`:

```tsx
<input placeholder="Search messages" intl:placeholder />

<button
	aria-label={count === 1 ? `Delete ${count} message` : `Delete ${count} messages`}
	intl:aria-label="plural:cardinal"
/>

<input
	aria-label={`Only ${minimumDistance}-${maximumDistance} miles away`}
	intl:aria-label="unit:distance-road"
/>
```

The activator value is the flattened equivalent of nesting a finite formatter role inside a content
message. Its canonical string shape is `<role>:<selector>` using the same role and selector
vocabularies as ordinary enhancements, for example `display-name:language`, `unit:distance-road`,
`plural:cardinal`, or `plural:ordinal`. It is inert build-time metadata, not a runtime expression
language. A shorthand must identify exactly one analyzer-proven compatible placeholder or selector;
ambiguous property expressions require typed values or an explicit finite options object. That
object also carries the optional name without adding a separate public `intl:name` role:

```tsx
<button
	aria-label={`Change language to ${languageCode}`}
	intl:aria-label={{
		format: 'display-name:language',
		name: 'language-picker'
	}}
/>
```

Multiple property activators on one intrinsic select one canonical `IntlAttributes` component but
retain independently keyed message descriptors:

```tsx
<input
	placeholder="Search messages"
	aria-label="Search your messages"
	intl:placeholder
	intl:aria-label
/>
```

The initial allowlist includes `alt`, `title`, `placeholder`, `aria-label`, `aria-description`,
`aria-roledescription`, and `aria-valuetext`, plus narrowly proven metadata `content` contexts.
Property messages accept scalar placeholders and finite branches but no structural fragments. URLs,
IDs, classes, styles, handlers, form-control state, and protocol- or identity-bearing properties
cannot be activated. The authored intrinsic remains the same semantic host, and unrelated props,
events, refs, ownership, and contribution layers remain unchanged.

Component libraries may deliberately publish both a localized scalar fallback and a
framework-owned accessibility relationship enhancement. The intl descriptor remains extractable
and valid in every build, and intl continues to publish the localized scalar independently.
`aria-labelledby` may coexist with `aria-label`, and `aria-describedby` may coexist with
`aria-description`; the platform gives the relationship the appropriate precedence. Intl does not
inspect accessibility, forms, or arbitrary third-party enhancement identities. The initial
implementation performs no cross-enhancement suppression or cleanup optimization merely to remove
the shadowed attribute. A future optimization requires measured value and a generic enhancement
composition contract.

### Display names

`display-name` formats a code through a finite locale-data domain rather than treating it as authored
prose:

```tsx
<_ intl:display-name="region">US</_>
<_ intl:display-name="language">fr</_>
<_ intl:display-name="currency">USD</_>
<_ intl:display-name="calendar">islamic</_>

<_ intl:message>
	Shipping destination: <_ intl:display-name="region">{region}</_>.
</_>
```

The initial domains cover languages, regions, scripts, currencies, calendars, and date/time fields
supported by the pinned locale-data contract. A static, branded, or analyzer-proven finite-union
code is validated during analysis; dynamic unknown values follow configured code-fallback policy.
A standalone currency display name is distinct from a currency quantity, whose number-sensitive
morphology remains owned by the currency formatter.

A projection containing only a display-name formatter has no linguistic source text. It retains a
stable runtime descriptor key, but extraction omits it from XLIFF and language tooling reports
catalog coverage as not applicable rather than zero translated locales.

Property messages use the same projection:

```tsx
<button aria-label={`Change language to ${languageCode}`} intl:aria-label="display-name:language" />
```

### Explicit components

Every enhancement implementation remains an ordinary component and may be exported explicitly:

```tsx
<IntlMessage>Welcome, {this.props.name}.</IntlMessage>

<IntlMessage name="navigation">Home</IntlMessage>

<IntlMessage plural={this.state.messageCount}>
	You have {this.state.messageCount} new
	{this.state.messageCount === 1 ? 'message' : 'messages'}.
</IntlMessage>

<IntlMessage select={this.props.role}>
	{this.props.role === 'owner' ? 'Owner' : 'Member'}
</IntlMessage>

<IntlUnit unit="distance-road">
	{this.state.distance} miles
</IntlUnit>

<IntlUnit cldr="length/road">{this.state.distance}</IntlUnit>
```

Use explicit components when translated behavior is required by the component's design, when direct
composition is clearer, or when building lower-level internationalization infrastructure. The
enhancement and explicit forms must share one implementation and message IR rather than diverging
into optional and required formatting systems. The analyzer recognizes the invocation through its
published finite intl role; it does not inspect the component implementation. Other explicit
components remain opaque.

### Public authoring contracts

The initial author-facing activation types are finite. These are conceptual declarations; package
source should expose equivalent branded and literal-narrowed TypeScript types rather than accepting
open records or arbitrary strings:

```ts
type IntlMessageName = string;
type IntlExactSelector = string | number | boolean;

type IntlMessageActivation = true | IntlMessageName;

type IntlPluralActivation =
	| number
	| Readonly<{
			value: number;
			name?: IntlMessageName;
	  }>;

type IntlSelectActivation<Value extends IntlExactSelector = IntlExactSelector> =
	| Value
	| Readonly<{
			value: Value;
			name?: IntlMessageName;
	  }>;

type IntlCurrencyDisplay = 'symbol' | 'narrowSymbol' | 'code' | 'name';
type IntlCurrencyActivation =
	| true
	| Iso4217CurrencyCode
	| Readonly<{
			currency?: Iso4217CurrencyCode;
			display?: IntlCurrencyDisplay;
			name?: IntlMessageName;
	  }>;

type IntlPropertyFormat =
	| `display-name:${IntlDisplayNameKind}`
	| `unit:${IntlSemanticUnit}`
	| 'plural:cardinal'
	| 'plural:ordinal';

type IntlPropertyActivation =
	| true
	| IntlPropertyFormat
	| Readonly<{
			format?: IntlPropertyFormat;
			name?: IntlMessageName;
	  }>;
```

`Iso4217CurrencyCode`, `IntlDisplayNameKind`, `IntlSemanticUnit`, exact CLDR selectors, canonical
source/destination units, date/time option keys, and style values are generated finite unions from
the pinned intl data contract. Context is a nonempty, Unicode-normalized semantic phrase with a
configured size limit; it is never an executable expression language or complete catalog key.
Const objects and finite spreads are accepted when analysis can prove the same closed shape. Unknown
keys, open dictionaries, dynamic formatter-role strings, and conflicting activators are diagnostics.

The shared `IntlMessage` component exposes a discriminated public prop union: exactly one of
`message`, `plural`, or `select` establishes the region. The explicit component expresses the same
choice with `name`, `plural`, or `select` props but does not require a redundant `message` prop.
`IntlAttributes` exposes only the allowlisted property activators, and Unit exposes exactly one of
`unit` or `cldr` plus optional `sourceUnit` and `convertTo`. `convertTo` is a statically known
compatible destination, never a reactive preference.

Typed monetary and measurement values are optional analyzer evidence, not required authoring
wrappers. The browser-safe contract defines opaque branded shapes equivalent to:

```ts
interface IntlMonetaryValue<Currency extends Iso4217CurrencyCode = Iso4217CurrencyCode> {
	readonly value: number | bigint;
	readonly currency: Currency;
	readonly [intlMonetaryValue]: true;
}

interface IntlMeasurementValue<Quantity extends string = string, Unit extends string = string> {
	readonly value: number;
	readonly quantity: Quantity;
	readonly unit: Unit;
	readonly [intlMeasurementValue]: true;
}
```

Official factories may construct these values, and approved packages may publish compatible branded
contracts through the inert analyzer contract. The analyzer never treats an arbitrary object with
`value`, `currency`, or `unit` properties as trusted semantic evidence. Plain values with complete
authored fallback presentation remain the idiomatic form.

The component implementation has an additional package-private prepared-activation union branded by
an unexported `unique symbol`. Only generated intl instrumentation can construct it. That internal
variant carries a descriptor reference and evaluated bindings while satisfying the same canonical
component prop. It is deliberately absent from completion and author-facing documentation.

## Source-local and unavailable behavior

There are two distinct fallback cases:

1. If the internationalization component is active but no translated catalog entry exists, it
   executes the analyzer-emitted source message plan using the owning package's source locale and
   source formatter instructions.
2. If the optional enhancement implementation is unavailable, the authored intrinsic or `_`
   fragment executes unchanged under the normal enhancement contract.

Formatter fallback content must therefore remain meaningful without the optional implementation.
For a unitized value, the annotated range includes both the value expression and its authored
source-locale unit presentation:

```tsx
<_ intl:message>
	Only <_ intl:unit="distance-road">{this.state.airportDistance} miles</_> from the airport.
</_>
```

With no internationalization implementation, this renders the authored sentence directly. With the
implementation active, the inner formatter becomes one typed unit placeholder in the outer message
plan and replaces the complete `{airportDistance} miles` range. A translation may reorder that
placeholder, and its unit formatter may convert and render it as, for example, `8 kilomètres`; the
literal source word `miles` is fallback presentation rather than an independently translated token.
The intl analyzer derives semantic quantity/usage identity from `intl:unit`, `intl:cldr`, or a typed
measurement. It resolves source-unit encoding separately from a typed measurement, an explicit
disambiguator, a strictly recognized label inside the annotated fallback, or package policy. It
never parses unrelated surrounding prose and diagnoses any analyzer-proven contradiction.

Component libraries therefore publish usable authored behavior without requiring translations.
They may also remain usable when the application does not bundle the internationalization
enhancement, subject to the literal fallback the component author chose. The analyzer must not
silently synthesize required runtime formatting into an unavailable enhancement target.

Development warns once for an active message whose requested translated entry is missing. Production
uses the configured source-locale plan and never exposes an opaque hash or internal message key to
users. Strict builds may require complete catalogs for selected locales and reachable messages.

## Normalized message identity

Translation identity and execution identity are separate. The translator-facing key hashes a
generic contract containing the source locale, content/property target, significant text, generic
placeholder and structure IDs, selector cases, and a guide describing each placeholder's human
role and copy/delete policy. It excludes source paths, runtime binding indexes, eXact formatter
options, generated artifacts, and any contract-version prefix. Consequently, internal lowering can
change without invalidating a translation whose visible text and placeholder guide are unchanged.

Placeholder IDs are assigned by stable semantic position. Repeated references to one analyzed
value retain a consistent generic role, and translation validation rejects unknown, deleted
protected, duplicated non-copyable, or structurally changed codes.

An ordinary component slot contributes its authored semantic slot name and role, never the text or
message identities rendered by that component. Updating a descendant component therefore cannot
invalidate the enclosing message key.

The canonical generic translation contract is retained for diagnostics and catalog interchange.
Catalog ownership/provenance remains separate from the key so two packages cannot accidentally
override each other's message merely by authoring the same source sentence.

An optional name makes a key recognizable. On the `message` enhancement, its string value is the
name shorthand:

```tsx
<_ intl:message="navigation">Home</_>

<_ intl:message="property-description">Home</_>
```

The string describes purpose; it is not the complete catalog ID. Activators whose value already
declares a selector or formatter carry `name` in their finite options object instead:

```tsx
<p intl:plural={{ value: count, name: 'inbox-status' }}>
	You have {count} new {count === 1 ? 'message' : 'messages'}.
</p>

<p intl:select={{ value: role, name: 'account-membership' }}>
	{role === 'owner' ? 'Owner' : 'Member'}
</p>
```

There is no standalone `intl:name` enhancement. The normalized name prefixes the translation hash
but does not establish a message boundary by itself. Changing visible source meaning, generic
placeholder structure, target property, or authored name creates a new key. Build tooling removes
obsolete catalog entries rather than preserving automatic migration aliases.

## Structural selection and pluralization

Control flow lexically authored inside a message belongs to that message. The analyzer retains all
finite cases as a decision tree; it does not choose the currently active case during the build or
flatten nested selectors into a Cartesian set of messages.

An ordinary boolean branch becomes a `true`/`false` selector:

```tsx
<p intl:message>{this.state.online ? <>Online</> : <>Offline</>}</p>
```

A finite equality chain over one effect-free selector becomes an exact selection:

```tsx
<p intl:message>
	{this.props.role === 'owner' ? (
		<>Owner</>
	) : this.props.role === 'member' ? (
		<>Member</>
	) : (
		<>Guest</>
	)}
</p>
```

Nested cases may contain local intrinsic structure and explicit structural slots. Ordinary
components inside a case remain opaque under the same lexical ownership rule.

A branch outside a message boundary creates independently owned messages:

```tsx
return () =>
	this.state.active ? <p intl:message>Active account</p> : <p intl:message>Inactive account</p>;
```

Putting the condition inside one boundary instead creates one selector-bearing message. This
distinction is source-visible and participates in normalized identity.

Message pluralization is a structural selector, not a scalar format call. It remains explicit for
prose outside a formatted value because a source-language predicate such as `count === 1` does not
describe every target locale. Formatter-local morphology follows the narrower implicit contract
described above:

```tsx
<p intl:plural={this.state.messageCount}>
	You have {this.state.messageCount} new {this.state.messageCount === 1 ? 'message' : 'messages'}.
</p>
```

`intl:plural` contributes its reactive numeric operand to the nearest lexical message, or creates an
implicit message scope when used alone. Its common form takes that value directly; the finite
`{ value, name }` form adds a readable name to the implicit message without changing selector
semantics. The displayed count and every operand-dependent source ternary refer to one binding. The
operand is read once per reactive update; that value selects the active case and supplies every
displayed occurrence, avoiding duplicate watchers or inconsistent reads. In an active translation,
a plain displayed occurrence receives the catalog's number formatting; an explicit nested
`intl:number` remains available when source requests additional formatting options.

Several source-language changes may depend on the same operand without creating independent
selectors:

```tsx
<p intl:plural={count}>
	{count === 1 ? 'There is' : 'There are'} {count} {count === 1 ? 'message' : 'messages'}.
</p>
```

The analyzer coalesces equivalent predicates into one source partition:

```text
=1: There is {count} message.
other: There are {count} messages.
```

It does not form four combinations. Full-sentence branches and exact numeric cases remain valid
when source language needs them:

```tsx
<_ intl:plural={count}>
	{count === 0 ? (
		'You have no new messages.'
	) : count === 1 ? (
		'You have one new message.'
	) : (
		<>You have {count} new messages.</>
	)}
</_>
```

The authored exact predicates describe source-locale fallback partitions, not universal plural
categories. The analyzer records exact cases such as `=0` and `=1`, preserves `other`, and allows a
target catalog to replace that partition with the plural categories required by its locale.

`intl:select` follows the same message-boundary, direct-value or `{ value, name }` authoring, and
single-binding model for non-plural exact selection:

```tsx
<p intl:select={this.props.role}>
	You are signed in as
	{this.props.role === 'owner'
		? 'the owner'
		: this.props.role === 'member'
			? 'a member'
			: 'a guest'}
	.
</p>
```

The authored branch remains the directly executable source fallback. For inferred boolean/exact
selection and explicit `intl:plural` or `intl:select`, the intl analyzer lowers a pure, statically
understandable branch tree into message selector IR. It must prove that:

- branch predicates derive only from the inferred or declared selector and immutable constants;
- every selector occurrence refers to the same analyzer-proven binding, whose value is evaluated
  once for the update;
- repeated equivalent predicates are coalesced rather than multiplied into independent selectors;
- comparisons and fallthrough are finite and deterministic;
- a complete fallback branch exists;
- evaluating the branch introduces no effects; and
- every branch produces valid message content and a catalog-valid placeholder/structural-slot
  contract.

An unsupported predicate is a focused diagnostic on the explicitly internationalized region rather
than a guessed translation. Unbounded list generation is not treated as a finite branch; use the
list formatter or author message boundaries inside the list item component.

Plural translations do not execute the authored `count === 1` condition universally. The source
locale interprets the authored fallback cases; target catalogs may provide `zero`, `one`, `two`,
`few`, `many`, `other`, and exact numeric cases. The active runtime selects target cases with the
resolved locale's plural rules. A translation may add locale-required categories while retaining the
source `other` branch as the required semantic fallback.

## Safe structural fragments

Translations sometimes need to reorder a link, emphasized phrase, icon label, or component-owned
range. Put a nested fragment enhancement directly on a locally authored intrinsic when that
intrinsic is the movable slot:

```tsx
<_ intl:message>
	Read our
	<a href="/terms" intl:fragment="terms">
		terms of service
	</a>
	.
</_>
```

The intl analyzer records `terms` as a movable structural placeholder. A translation may reposition
the slot and translate its locally authored intrinsic content, but the same authored anchor remains
its semantic host. Translation cannot replace its identity, change `href`, add props or handlers,
inject HTML, or invoke arbitrary code. Its ordinary props, events, refs, ownership, and `_target`
contributions remain layered on that host.

Use `_` when the slot is an ordinary component or another opaque range that has no direct intrinsic
host:

```tsx
<_ intl:message>
	Welcome,
	<_ intl:fragment="user">
		<UserBadge />
	</_>
	.
</_>
```

The `user` range may move but is exactly-once, opaque content by default. Its internal messages are
extracted independently. Unnamed locally authored intrinsic fragments may receive stable positional
slots only when the analyzer proves an unambiguous finite shape; component ranges and
`props.children` always require an explicit semantic name.

`intl:fragment` is valid only inside an enclosing message. It neither creates a standalone message
nor causes analysis to descend into an opaque component; applying it outside a message is a focused
diagnostic.

Catalogs contain message data and formatter/slot instructions, never executable VNodes or component
implementations.

## Numbers, display names, currencies, dates, times, lists, and relative values

The finite formatter set should initially include:

- decimal, percent, and compact numbers plus analyzer-proven ordinal projections;
- standalone display names for finite locale-data code domains;
- currency display with an analyzer-resolved source currency and presentation;
- dates and times with explicit or context-provided time zones;
- duration and relative time inferred from Temporal values, fallback projections, or explicit roles;
- conjunction, disjunction, and unit lists; and
- unitized numeric values as specified separately below.

The same source-shaped range rule applies to compatible number, currency, Unit, date/time, and
Temporal projections. Two endpoints and their ordinary fallback punctuation form one range
projection; the selected canonical formatter owns target punctuation, shared-field or unit elision,
and range morphology.

Formatter options use typed enhancement props and canonical kebab-case JSX names. Locale-sensitive
defaults come from the active locale. Host process defaults must not silently determine time zone,
currency, calendar, or measurement policy during SSR.

Currency formatting never implies currency conversion. Ordinarily, the authored fallback and owning
package's source locale provide both currency identity and display intent without redundant props:

```tsx
<_ intl:currency>${this.state.total}</_>

<_ intl:currency>{this.state.total} USD</_>

<_ intl:currency>
	{this.state.total} {this.state.total === 1 ? 'US dollar' : 'US dollars'}
</_>
```

For a package whose source locale is `en-US`, these fallbacks infer `USD` with `symbol`, `code`, and
`name` display respectively. The explicit Currency projection establishes monetary intent, so a
markerless value may use the source locale's CLDR-backed conventional currency; an unmarked number
elsewhere never does. The JavaScript build host enumerates native
`Intl.supportedValuesOf('currency')` and gathers name/symbol parts from
`Intl.NumberFormat(...).formatToParts()` across operands selected by the source locale's own
cardinal rules. It removes ambiguous labels and ISO-code-shaped symbol fallbacks before sending the
bounded profile to the Go analyzer. The analyzer records source placement and spacing for the
directly executable fallback, but active output uses the target locale's placement, spacing, symbol
choice, numeric formatting, and currency-name plural morphology.

The analyzer resolves source currency identity in this order:

1. a currency carried by an analyzer-recognized typed monetary value;
2. an explicit currency in the activator string or finite options object;
3. an exact ISO 4217 code in the annotated fallback;
4. a locale-data-backed currency name or symbol that is unambiguous under the owning package's
   source locale; and
5. the CLDR-backed conventional currency for the owning package's source locale; and
6. a diagnostic requiring explicit disambiguation.

Every available signal is validated even when an earlier signal wins. Thus `$` under `en-US`
resolves to the locale-conventional USD, while `CA$` resolves to CAD. A localized label that remains
ambiguous after the locale's contextual symbol forms are considered is removed from the profile and
requires an explicit currency. A fallback marker that contradicts a typed or explicit currency is a
diagnostic.

Display intent is likewise inferred as `symbol`, `code`, or `name`. When `symbol` and
`narrowSymbol` render the same source glyph, the ordinary inference is `symbol`; requesting the
narrow form requires an explicit finite option. Exceptional disambiguation and non-visible policy
use one options object rather than a separate `intl:display` enhancement:

```tsx
<_ intl:currency={{ currency: 'CAD', display: 'narrowSymbol' }}>${this.state.total}</_>
```

An explicit currency may omit a visible marker when the enhancement is required through the
corresponding explicit component. For optional enhancement authoring, the source fallback must still
be meaningful when intl is unavailable, so a markerless number is discouraged and diagnosed under
strict fallback policy.

Converting USD to EUR requires application-owned exchange-rate data and an ordinary derived value or
task. Neither translators nor the internationalization package may invent a rate.

Relevant standards:

- [ECMAScript Temporal](https://tc39.es/proposal-temporal/)
- [ECMA-402 DateTimeFormat](https://tc39.es/ecma402/#datetimeformat-objects)
- [ECMA-402 DisplayNames](https://tc39.es/ecma402/#sec-intl-displaynames-constructor)
- [ECMA-402 DurationFormat](https://tc39.es/ecma402/#sec-intl-durationformat-constructor)
- [ECMA-402 PluralRules](https://tc39.es/ecma402/#sec-intl-pluralrules-constructor)
- [ECMA-402 RelativeTimeFormat](https://tc39.es/ecma402/#sec-intl-relativetimeformat-constructor)

## Units and automatic conversion

The Unit component is selected by a measurement-system-neutral semantic purpose or an exact CLDR
quantity/usage pair:

```tsx
<_ intl:unit="distance-road">{this.state.distance} miles</_>

<_ intl:cldr="length/road">{this.state.distance} miles</_>

<_ intl:unit="distance-road">
	{this.state.minimumDistance}-{this.state.maximumDistance} miles
</_>

<_ intl:unit="duration-media" intl:style="digital">{duration}</_>
```

`intl:unit` never selects miles, kilometers, or another measurement system. It exposes a finite,
globally unambiguous eXact semantic vocabulary such as `distance-road`, `height-person`, or
`temperature-weather`. `intl:cldr` is the standards-level equivalent and requires the complete
Unicode `<quantity>/<usage>` pair such as `length/road`, `length/rainfall`, or `speed/rainfall`.
Both activate the same canonical Unit component and are mutually exclusive selectors for one
formatter.

The value's source-unit encoding is separate. In the examples above, `miles` is both meaningful
direct fallback and a strictly bounded source-unit label available to analysis. It does not request
that the target locale continue using miles. Typed measurement values, package policy, or an
explicit `intl:source-unit` disambiguator can supply the same fact without relying on a label.

Inside `intl:message`, a unit formatter lowers to one typed placeholder containing its canonical
quantity/usage pair, resolved source unit, value bindings or structured Temporal value, value shape,
and presentation options. The surrounding message owns prose such as `Only` and `from the airport`;
the nested formatter owns the complete source fallback range such as `5 miles` or `3-5 miles`.
Translations can reorder the placeholder without gaining access to its reactive expression or
changing its physical quantity.

One compatible value denotes a scalar. Two compatible endpoint bindings separated by supported
source range punctuation denote a closed range; no `intl:range` activator is required. The active
formatter localizes and converts both endpoints together, collapses equal endpoints, uses target
range punctuation and repeated-unit elision, and applies locale plural-range rules rather than
forming two independent plural selectors. The first delivery requires ordered finite endpoints;
reversed, non-finite, or open-ended values receive a focused development diagnostic or runtime
validation failure according to build strictness.

### CLDR selectors and semantic usage vocabulary

`intl:cldr` exposes Unicode's own quantity and usage identifiers in their data-model order. The `/`
is eXact source syntax joining the two separately modeled CLDR coordinates; it is not part of either
Unicode identifier. The intl analyzer validates both coordinates against the package's pinned Unicode
data and retains the canonical pair in formatter metadata:

```tsx
<_ intl:cldr="length/rainfall">{this.state.rainDepth}</_>
<_ intl:cldr="speed/rainfall">{this.state.rainRate}</_>
<_ intl:cldr="length/person-height">{this.state.height}</_>
<_ intl:cldr="mass/person">{this.state.mass}</_>
```

`intl:unit` exposes a finite, globally unambiguous eXact vocabulary. Its names favor the concept an
author is expressing rather than preserving Unicode quantity terminology or word order. Each alias
normalizes immediately to the same canonical CLDR pair accepted by `intl:cldr`. The initial mapping,
subject to the Unicode version pinned for implementation, is:

| eXact `intl:unit`             | Canonical CLDR pair           |
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
the canonical pair, so `intl:unit="distance-road"` and `intl:cldr="length/road"` never create two
catalog identities.

### Source-unit inference

For a semantic Unit formatter, the intl analyzer resolves the canonical source unit in this order:

1. a unit carried by an analyzer-recognized typed measurement value;
2. an explicit `intl:source-unit` disambiguator;
3. a strictly recognized source-unit label inside the annotated fallback range, drawn from the
   JavaScript build host's native `Intl.NumberFormat` unit parts for the package source locale plus
   a bounded language-specific inference profile (currently including the retained English
   compatibility vocabulary);
4. the owning package's pinned `sourceUnits[quantity/usage]` override;
5. the versioned eXact source-unit convention for that package's `sourceLocale` and canonical CLDR
   pair;
6. a diagnostic requiring a typed value, source label, explicit disambiguator, or package override.

The host-generated vocabulary is bounded to supported canonical units, display widths, and
representative plural operands. Ambiguous labels are discarded rather than guessed. The analyzer
validates every available source-unit signal and diagnoses contradictions even when an
earlier signal would otherwise have precedence. Source-label recognition is permitted only inside
the explicit Unit projection and against the finite unit vocabulary compatible with its semantic
quantity; arbitrary surrounding prose is never parsed for measurement semantics. Ambiguous labels
such as locale-dependent customary units require a typed value or `intl:source-unit`.

The source-locale convention is a fixed input-unit convention, not Unicode's magnitude-sensitive
destination preference. Tooling materializes the resolved canonical unit into analyzer metadata so
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
rebuild that may change normalized message identity and requires catalog revalidation. The analyzer
must not silently choose a source unit when the package locale lacks enough region information or
the usage has no stable convention.

Formatting and conversion are separate operations:

- without conversion policy, the formatter localizes the numeric value and source-unit display;
- `intl:unit` or `intl:cldr` requests locale-, region-, magnitude-, and purpose-appropriate
  destination selection;
- `intl:convert-to` explicitly selects a compatible destination unit; and
- display, notation, precision, rounding, sign, and grouping props control presentation without
  changing the stored source value.

`intl:convert-to` is the exceptional hard override for the displayed destination unit. It does not
describe the stored value's source unit, change the semantic quantity, mutate application data, or
request currency conversion. For example, the analyzer still reads `miles` as the source encoding
below, while an active formatter always converts the displayed result to kilometers:

```tsx
<_ intl:unit="distance-road" intl:convert-to="kilometer">
	{distance} miles
</_>
```

The unavailable-enhancement fallback remains the authored value in miles. `convert-to` describes an
output-formatting conversion only; it never mutates `distance` or changes the application's stored
value. Use it only when an application or domain requires a fixed presentation unit, such as a
regulated report, interoperable export, or consistently labeled chart axis. Ordinary localized UI
should omit it and allow locale, usage, magnitude, and user policy to select the destination. If
correct operation requires the conversion rather than merely enhanced presentation, use the
required explicit Unit component.

The first delivery follows this destination-unit precedence:

1. a static authored `intl:convert-to`, which fixes the compatible destination and ends selection;
2. otherwise, an explicit application or user unit preference;
3. a compatible target-catalog formatter instruction;
4. Unicode CLDR unit preferences for the resolved locale/region, usage, and magnitude; and
5. the authored source unit.

`convert-to` is not a user preference and cannot be overridden by a translation, locale convention,
or user setting. A translation may request a culturally appropriate destination or mixed-unit
presentation only when no fixed `convert-to` is present, and build validation restricts every choice
to the same physical quantity. A length cannot become a mass, an absolute temperature cannot
silently become a temperature delta, and incompatible compound dimensions are diagnostics.

`@exactjs/intl` owns a versioned, tested conversion engine and the selected Unicode conversion and
unit-preference data. It must support:

- multiplicative and offset conversions, including temperature;
- compatible compound units;
- locale-preferred mixed units such as feet and inches;
- magnitude thresholds used by a usage such as road distance;
- negative values using the standard absolute-magnitude preference selection while preserving sign;
- rounding only after conversion and destination selection; and
- plural-sensitive display based on the final displayed quantity.

The implemented runtime consumes the pinned Unicode CLDR 48 `unitPreferenceData` artifact rather
than maintaining a region switch. It resolves semantic quantity/usage pairs to CLDR categories,
uses the locale's maximized region with `001` fallback, honors `u-ms-ussystem`, `u-ms-uksystem`, and
`u-ms-metric` through CLDR unit-system compatibility plus `u-rg` region overrides, evaluates `geq`
thresholds against the converted absolute magnitude, and lowers
supported compound destinations to ordered mixed units. A range uses its largest absolute endpoint
for threshold selection so its endpoints retain one visible unit. CLDR preference skeletons do not
override eXact's source-precision rule below. A checked build script projects only supported
semantic usages and their unit-system metadata into the runtime; the full `cldr-core` package is a
development dependency rather than application payload, and the derived data ships with its
Unicode license.

Unless an authored formatter or enhancement supplies explicit fraction- or significant-digit
options, conversion preserves the visible precision of the evaluated source value. Rounding occurs
after destination selection and conversion. Thus `12-18 miles` may become `19-29 kilometers`, and
`72 °F` becomes `22 °C`, while a source value that visibly carries one fractional digit permits one
fractional digit in the converted result. A range uses the greatest visible source precision of its
endpoints without forcing trailing zeroes. For a dynamic binding the analyzer cannot infer lexical
precision; the runtime uses the evaluated numeric value. An authored `Math` operation or native
`Intl` formatting projection can assert a different precision, and explicit digit options always
override the default. This default is formatter behavior rather than canonical message metadata,
so adopting it does not churn otherwise identical catalog keys.

Source precision must not collapse a finite nonzero conversion to zero. When the selected unit has
a smaller numeric scale, the runtime retains the minimum additional fraction digits required to
keep the converted value nonzero; explicit digit options still win.

Unit selection cannot be delegated to `Intl.NumberFormat`: that API formats a number with a supplied
unit but does not choose or convert the unit. Duration projections may use `Intl.DurationFormat`
after the analyzer has preserved authored field-selection, balancing, and `relativeTo` policy.
Browser `Intl` formatting may be used after the package has selected and converted the value. Server
and client artifacts must use the same conversion-data version, unit policy, locale resolution, and
catalog fingerprint.

Custom/private units require an application-configured finite conversion and display contract. They
receive no automatic dimensional relationship merely because their names look similar. Conversion
tables are build inputs, not translator-authored executable functions.

Relevant standards:

- [Unicode LDML unit identifiers, conversion, and preferences](https://www.unicode.org/reports/tr35/tr35-general.html#Unit_Preferences)
- [Unicode supplemental unit conversion and preference algorithms](https://www.unicode.org/reports/tr35/tr35-info.html#Unit_Preferences)
- [Unicode MessageFormat unit formatter model](https://www.unicode.org/reports/tr35/tr35-messageFormat.html)

## Internationalization analysis and application linking

Internationalization components identify their finite roles through an `@exactjs/intl`-owned,
inert contract. The intl analyzer validates canonical roles and public prop contracts without
executing component implementations. Roles include the shared message component and its plural and
exact-selection activators, structural fragment, intrinsic property message, number, currency,
semantic unit, display name, date, time, duration, relative time, and list. An activator identifies
a finite component role; it does not grant permission to inspect an ordinary component
implementation.

Protocol 1 uses the fixed native analyzer distributed with `@exactjs/intl-analyzer`; role
declarations cannot nominate package-provided executable scripts. Enabling the bundler's
`internationalization` option is the explicit build-code decision that starts that known analyzer
for application-owned source. Published libraries ship precomputed source descriptors, so reaching
a dependency component or catalog never executes dependency-provided analyzer code.

Analysis and linking are two ordered build stages rather than one post-compile callback:

1. After module resolution establishes physical package ownership, source locale, selected intl role
   declarations, and explicit activation of the fixed analyzer, it reads the original TypeScript/TSX
   before the ordinary component transform. It emits descriptors plus source-mapped TSX
   instrumentation containing only ordinary imports, expressions, functions, and enhancement props.
2. The standard compiler processes that instrumented source normally. It remains responsible for
   component identity, reactivity, placement, enhancement grouping, and renderer output, without
   recognizing any message or locale concept.
3. After the public component-build facts and artifact graph are available, the intl linker joins
   analyzer-declared owner component IDs to reachable artifacts, validates catalogs, slices data,
   and emits artifact-local virtual modules.

The analyzer may reuse the TypeScript-Go frontend in a separate intl mode or executable so it derives
the same public component IDs as ordinary compilation. The linker validates every analyzer-declared
owner ID against `ExactComponentBuildFacts.components` and uses only public artifact-graph facts for
reachability and placement. A mismatch is a build error, not a reason to inspect render-program or
partition-plan opcodes. Application descriptors use component-level companions. Published package
data remains inert until a reached package artifact contains its compiled descriptor key, and the
coordinator projects only those reached keys into that artifact's registration module.

This ordering does not cause analysis to descend through component definitions. Each message remains
bounded by its lexical source region. Published libraries ship their already instrumented component
code, source descriptors, and source maps, so consuming applications validate and link data without
running dependency-provided analyzer code.

### Prepared activations and runtime bindings

The analyzer replaces an analyzed activator's authored payload with the package-private prepared
activation variant described above. It also removes the analyzed lexical content from that boundary
and represents it once in the source fallback plan and binding vector. Conceptually, this source:

```tsx
<p intl:message>
	Hello, {name}. Read <a href={termsUrl}>the terms</a>.
</p>
```

is supplied to the standard compiler in a shape equivalent to:

```tsx
import { prepare0 as __intlPrepare0 } from 'virtual:exact-intl/source/example';

const __intlElement0 = (children: Child, values: readonly unknown[]) => (
	<a href={values[1] as string}>{children}</a>
);

<p intl:message={__intlPrepare0([name, termsUrl], [__intlElement0])} />;
```

This is illustrative generated code, not an author-facing helper API. The descriptor's source plan
contains the text, value references, and element body. Direct reactive inputs occur once in the
generated value vector, so the ordinary compiler observes and updates them as one enhancement prop;
the plan never reevaluates application expressions. Selector values likewise occupy one binding and
are read once per reactive update.

A direct intrinsic structural fragment becomes a hoisted, stable element factory that accepts its
translated children and the explicit value vector. An explicitly named opaque component fragment
becomes a stable exactly-once factory that accepts no translator-provided props or children. The
runtime invokes only factories referenced by validated structural nodes, at most once per output
plan, and preserves their generated keys across locale changes. Events, refs, component identity,
and reactive props stay in ordinary compiler-owned code. No runtime traversal discovers text,
component implementations, or semantic slots, and no VNode is cloned.

Prepared instrumentation is emitted only when the selected intl component implementation and the
explicitly enabled fixed analyzer are both present. A build with no active intl implementation sends the original
source directly to the standard compiler, preserving the zero-intl fallback. An artifact must not
contain a prepared activation without its matching runtime descriptor and canonical enhancement
component; that condition is a link error rather than an empty or partially translated render. An
active missing translation executes the descriptor's source plan with the same binding vector.

Property-message instrumentation retains the authored fallback property and supplies its prepared
activation to `IntlAttributes`; active output contributes the translated scalar through ordinary
`_target` property composition. It never removes or rewrites unrelated intrinsic properties.

### Portable message IR version 1

The browser-safe intl contract owns a versioned, data-only schema. Version 1 is equivalent to the
following discriminated types; implementations may use a more compact wire encoding only when it
round-trips this contract exactly:

```ts
type IntlBindingTypeV1 =
	| 'string'
	| 'number'
	| 'bigint'
	| 'boolean'
	| 'temporal-date'
	| 'temporal-time'
	| 'temporal-date-time'
	| 'temporal-instant'
	| 'temporal-zoned-date-time'
	| 'temporal-duration'
	| 'monetary'
	| 'measurement'
	| 'structure'
	| 'opaque-structure';

interface IntlBindingDescriptorV1 {
	readonly index: number;
	readonly kind: 'value' | 'selector' | 'element' | 'opaque';
	readonly type: IntlBindingTypeV1;
	readonly name?: string;
	readonly exactlyOnce?: true;
}

type IntlPatternV1 = readonly IntlPatternNodeV1[];

type IntlPatternNodeV1 =
	| Readonly<{ kind: 'text'; value: string }>
	| Readonly<{ kind: 'value'; binding: number }>
	| Readonly<{ kind: 'format'; bindings: readonly number[]; formatter: IntlFormatterV1 }>
	| Readonly<{
			kind: 'select';
			binding: number;
			rangeBinding?: number;
			selection:
				| 'boolean'
				| 'exact'
				| 'plural-cardinal'
				| 'plural-ordinal'
				| 'plural-range-cardinal'
				| 'plural-range-ordinal';
			cases: readonly Readonly<{ key: string; value: IntlPatternV1 }>[];
			fallback: IntlPatternV1;
	  }>
	| Readonly<{ kind: 'element'; binding: number; value: IntlPatternV1 }>
	| Readonly<{ kind: 'opaque'; binding: number; name: string }>;

type IntlFormatterV1 =
	| Readonly<{ kind: 'number'; options: IntlFiniteOptionsV1 }>
	| Readonly<{
			kind: 'currency';
			currency: string;
			display: 'symbol' | 'narrowSymbol' | 'code' | 'name';
			options: IntlFiniteOptionsV1;
	  }>
	| Readonly<{
			kind: 'unit';
			quantity: string;
			usage: string;
			sourceUnit: string;
			convertTo?: string;
			options: IntlFiniteOptionsV1;
	  }>
	| Readonly<{
			kind: 'date-time';
			temporalKind: IntlBindingTypeV1;
			options: IntlFiniteOptionsV1;
	  }>
	| Readonly<{ kind: 'duration'; purpose?: string; options: IntlFiniteOptionsV1 }>
	| Readonly<{ kind: 'relative-time'; unitBinding: number; options: IntlFiniteOptionsV1 }>
	| Readonly<{ kind: 'display-name'; domain: string; options: IntlFiniteOptionsV1 }>
	| Readonly<{ kind: 'list'; options: IntlFiniteOptionsV1 }>;

type IntlFiniteValueV1 = string | number | boolean | null | readonly IntlFiniteValueV1[];
type IntlFiniteOptionsV1 = Readonly<Record<string, IntlFiniteValueV1>>;

interface AnalyzedMessageDescriptorV1 {
	readonly protocol: 1;
	readonly owner: string;
	readonly ownerComponentId: string;
	readonly occurrenceId: string;
	readonly key: string;
	readonly contract: string;
	readonly canonicalTranslation: string;
	readonly name?: string;
	readonly sourceLocale: string;
	readonly target:
		| Readonly<{ kind: 'content' }>
		| Readonly<{ kind: 'property'; name: IntlPropertyName }>;
	readonly bindings: readonly IntlBindingDescriptorV1[];
	readonly source: IntlPatternV1;
	readonly capabilities: readonly string[];
	readonly sourceRange: SourceRange;
}

type IntlRuntimeDescriptorV1 = Pick<
	AnalyzedMessageDescriptorV1,
	| 'protocol'
	| 'owner'
	| 'occurrenceId'
	| 'key'
	| 'contract'
	| 'name'
	| 'sourceLocale'
	| 'target'
	| 'bindings'
	| 'source'
	| 'capabilities'
>;
```

`IntlFiniteOptionsV1` is a transport container, not an open authoring contract. Each formatter kind
has a separately enumerated validator that permits only its pinned option names, value domains, and
combinations; unknown keys and non-finite values are rejected before emission. Range shape is
represented by ordered formatter binding indexes. Duration field priority and relative-time unit
selection are represented by ordinary `select` nodes and formatter metadata rather than executable
callbacks.

Binding indexes are dense, zero-based, and assigned by first semantic occurrence after equivalent
source bindings are coalesced. Pattern nodes cannot reference undeclared bindings. `element` requires
an `element` binding, `opaque` requires an exactly-once `opaque` binding, selectors require a
`selector` binding, and formatter validators define their accepted value types and arity. Catalog
validation recursively enforces those rules before any plan reaches runtime.

### Stable identities and generated modules

Translation identity, execution identity, and build occurrence identity are deliberately separate:

- `key` is the untruncated base64url SHA-256 digest of the UTF-8 canonical generic translation
  contract. An optional Unicode-normalized message name and `_` prefix precede the digest. No
  protocol or contract-version token is included.
- `contract` is a separate untruncated base64url SHA-256 digest of exact bindings, execution source,
  formatter options, and sorted capabilities. It detects incompatible same-build runtime plans and
  permits one validated immutable contract representation to be reused.
- `owner` is the canonical package name; an unnamed application root receives one build-stable
  generated application owner. Lookup always uses the pair `(owner, key)`. The resolved physical
  package instance and version remain separate provenance; incompatible duplicate versions of one
  package are a link diagnostic unless application policy explicitly qualifies them.
- `occurrenceId` is build-local and identifies where a descriptor is activated. It is derived from
  physical package provenance, normalized package-relative module ID, public owner component ID,
  marked-region structural ordinal, and property target. It may change after structural source edits
  and never appears in translator-authored catalogs.

Two occurrences with the same `(owner, key)` share one translation only when their generic
translation contracts agree. Their exact execution contracts may differ if both materialize that
same generic pattern safely. A hash collision or same-hash contract disagreement is a fatal build
diagnostic. Server and client artifacts from one build use the same occurrence IDs and catalog
generation; HMR replacement increments a generation fence rather than aliasing stale instances.

For application source, the source stage emits a source-mapped companion virtual module for each
analyzed module. It exports prepared-activation constructors branded by the package-private runtime
symbol and imports no catalog. A component-library build materializes the same companion as a
relative generated JavaScript module inside the published package and rewrites its own instrumented
component import accordingly; consumers execute it only as part of an already selected and
authorized component library, never as analyzer code. The package-content check requires every such
companion and its matching descriptor artifact to be present. The link stage emits immutable
artifact-local modules equivalent to:

```ts
interface IntlArtifactProjectionV1 {
	readonly protocol: 1;
	readonly artifactId: string;
	readonly generation: number;
	readonly descriptors: ReadonlyMap<string, IntlRuntimeDescriptorV1>;
	readonly catalogs: ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, IntlPatternV1>>>;
}
```

The catalog map is `locale -> owner -> key -> validated target pattern`. Descriptor lookup inside an
artifact uses `occurrenceId`; translated-message lookup uses `(locale, owner, key)`.

Adapters register that projection through intl-owned generated facades alongside, but independently
from, the existing bundle-local enhancement catalog. Client, server, lazy, and test artifacts receive
only their reachable descriptors, locales, formatter code, and data. Runtime modules contain opaque
owner/key/occurrence identities but no filesystem paths or source excerpts. Source ranges and
canonical source text remain build/tooling data unless development diagnostics explicitly request
them.

Watch invalidation keys include source content, source-locale configuration, analyzer/runtime schema
versions, role declarations, catalog inputs, Unicode-data versions, and relevant artifact-graph
edges. Source changes rerun analysis only for affected modules; catalog-only changes relink affected
locale fragments without rerunning the standard compiler. Every generated module has deterministic
content ordering and a composed source map back to authored TSX.

The analyzer does not execute application components or select a runtime branch to decide message
correctness. It may interpret or summarize analyzer-proven pure local source graphs, including
finite arrays, standard iteration such as `find`, recognized arithmetic intrinsics, and standard
`Intl` operations, while preserving their decision semantics in portable IR. It never evaluates an
effectful application callback or follows a value producer through an opaque component boundary.
Its catalog validator consumes analyzer-emitted contracts during the build and reports translation
mismatches through source-linked diagnostics. The fixed native analyzer runs only when explicitly
enabled by the host option and cannot install callbacks into the standard compiler or consume
private render-plan opcodes.

### Generator capability requirements

Analyzed projections may require a standard client capability that is not present in every selected
browser target. The intl analyzer records that semantic requirement per reachable artifact, and the
shared coordinator resolves it through a general declarative generator contract:

```ts
interface GeneratedCapabilityRequirement {
	readonly capability: 'ecmascript.temporal' | 'ecmascript.intl-duration-format';
	readonly scope: 'client';
	readonly artifacts: readonly ArtifactId[];
	readonly load: 'before-evaluation';
}
```

The exact capability vocabulary belongs to the generator and is not intl-specific. The generator
deduplicates requirements from application code, intl projections, and other plugins; compares them
with configured browser targets; and emits nothing when every target has native support. Otherwise,
application build policy selects a bundled, self-hosted, or pinned-CDN provider. A CDN provider must
participate in CSP, integrity/provenance, failure, and same-origin or bundled-fallback policy rather
than becoming a hardcoded dependency of `@exactjs/intl`.

The supported Node server baseline is required to provide Temporal, so this proposal adds no legacy
server polyfill path. An intl implementation that owns its duration formatter rather than depending
on native `Intl.DurationFormat` need not request that client capability. A capability reachable only
from a lazy artifact remains paired with that artifact and loads once before its first evaluation or
hydration. Capability selection and delivery change neither standard compiler output nor message
identity.

## Catalogs and component libraries

The analyzer/linker emits message fragments beside the component/artifact metadata already consumed
by bundlers. A published component library may include:

- canonical source message contracts;
- source-locale fallback plans;
- any number of package-owned translated catalogs for the components it publishes;
- catalog format/version metadata; and
- provenance connecting every message to the compiled component owner.

It does not require a consuming application to include the internationalization enhancement or host
plugin. The final application chooses whether to link those optional capabilities.

Package participation is static and declarative. The protocol-1 manifest shape is:

```json
{
	"exact": {
		"internationalization": {
			"protocol": 1,
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

These are the protocol-1 field names. `protocol`, `sourceLocale`, and `messages` are required for a
package publishing message contracts. The canonical package name owns its catalog; protocol 1 does
not permit an arbitrary shared catalog namespace. `sourceUnits` and `catalogs` are optional closed
records. Locale keys are canonical BCP 47 tags, and every messages/catalog value is a bounded public
package export subpath rather than an arbitrary filesystem path. Unknown protocol-1 fields are
diagnostics; a future additive or breaking shape uses a new protocol version rather than silently
changing interpretation.

Catalog declarations are data publication, not host-plugin or analyzer entries: discovering a
component library's declared catalog must not execute that library, prepare a plugin registry, grant
server trust, or authorize build code. Protocol 1 source packages use the fixed analyzer only in
their own explicitly enabled build; published packages expose only their precomputed protocol-1
descriptors and catalogs.

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
4. analyzer-emitted source fallback.

Overrides match canonical owner plus normalized key and must satisfy the emitted placeholder,
selector, formatter, unit-dimension, and structural-slot contract. The analyzer first exports a
source-only XLIFF 2.1 translation request for each message owner. It contains `srcLang`, `<source>`
units, and their inline structure, but no `trgLang`, `<target>`, or generated translation. This is
the finite set a developer sends to a translation platform, AI workflow, or human translator.
A descriptor containing only formatter, scalar-value, or opaque-component placeholders is not
linguistic work and does not enter that set. Those placeholders remain represented when they occur
inside translatable text or a linguistic selector, because translators may need to reorder them.
Each requested target locale returns a bilingual XLIFF catalog. Those returned catalogs are the
persisted, translator-owned source of truth for translated content. Source text remains ordinary
XLIFF text; values and formatter results use `<ph>`, movable intrinsic regions and selectors use
`<pc>`, and selector cases use generic `<mrk>` annotations. XLIFF 2.1 retains the core
`urn:oasis:names:tc:xliff:document:2.0` namespace; the `version="2.1"` attribute identifies the
specification revision. Standard `equiv`, `canCopy`, and `canDelete` fields provide the complete
translator guide. Runtime binding indexes, formatter options, and eXact-specific metadata do not
enter XLIFF; they remain in the separately hashed generated execution contract. The representation
does not hide a translated structured message in a proprietary JSON target string.
Synchronization replaces analyzer-owned source plans while preserving structurally compatible
target markup, notes, segment state, and translator ordering, and removes units absent from the
current generated source set.

Every imported target lowers into the same validated eXact message IR. Protocol JSON remains a
supported adapter and generated runtime representation for programmatic integrations, but it is not
the authoritative file translators edit or workflows exchange. Runtime catalog entries contain
bounded data, not parser source or code. Additional translation-service or MessageFormat adapters
may operate through XLIFF or the finite adapter contract without changing the runtime protocol.

The bundler includes only messages, locale data, unit data, and formatter capabilities reachable
from each artifact. Lazy components and islands receive separate locale fragments. Component
libraries do not force all supported locales or all Unicode conversion data into an application
bundle.

## Locale resolution and reactive changes

Internationalization distinguishes three locale roles:

- **source locale** belongs to each message-owning package and identifies the language of its
  authored fallback, source plural interpretation, implicit source-unit conventions, and bounded
  currency-marker disambiguation;
- **development locale** belongs to a development render entry and is the target locale requested
  from every package participating in that preview; and
- **resolved runtime locale** belongs to an application render root and is selected from route,
  cookie, header, user, and application policy for the current render.

The application resolves a complete root locale environment rather than exposing only the first raw
`Accept-Language` value:

```ts
interface LocaleEnvironment {
	readonly locale: IntlLocaleString;
	readonly region: string;
	readonly direction: 'ltr' | 'rtl';
	readonly timeZone: string;
	readonly calendar?: string;
	readonly numberingSystem?: string;
	readonly unitPreferences?: IntlUnitPreferences;
	readonly catalogFingerprint: string;
}
```

`IntlLocaleString` is generated from the pinned CLDR language inventory and permits BCP 47
subtags and Unicode extensions after that known primary language. Literal attributes receive full
native-analyzer validation; `defineIntlLocale(value)` performs the same canonical validation while
narrowing dynamic route, request, or user input.

The `locale` enhancement owns intrinsic language metadata:

```tsx
<main intl:locale>{/* inherits the nearest environment */}</main>
<aside intl:locale="ar-EG">{/* uses or creates the Arabic locale scope */}</aside>
```

A valueless activation reuses the nearest `IntlProvider`. An explicit value asks that provider for
a cached scope sharing descriptors, catalogs, formatter caches, missing-message policy, and unit
policy; without a provider it creates a zero-configuration environment using generated artifacts.
The enhancement projects reactive `lang` and `dir` through `_target`, including SSR and hydration,
and strips Unicode extensions from the emitted `lang` value. Applications do not repeat locale
direction or baseline unit-preference tables.

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
analyzer-emitted source plan in its own declared source locale.

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

- Analyzed message descriptors are build-owned immutable data. Runtime message instances retain a
  compact descriptor identity and active parameter bindings, not a copied canonical source,
  source-range record, complete branch plan, or package catalog.
- Catalogs and Unicode conversion/format data are split by artifact, owner, locale, and capability.
  A process may share immutable validated generations, but caches require explicit byte/count
  bounds and generation-aware eviction.
- Formatter instances are shared by formatter-kind, canonical locale, and finite-option keys in a
  bounded, lazily created realm-wide core cache. Provider environments resolve locale policy before
  lookup; the shared pool contains no active-locale state. A message or unit enhancement must not
  create a formatter per render, eagerly construct unused formatters, or retain converted transient
  values after publication.
- Repeated reads and pure derived operations in one inferred projection are coalesced. The required
  duration fixture retains one duration reader rather than one reader for every field occurrence,
  and active output does not allocate the authored temporary array or source-locale formatter on
  every update.
- One canonical `IntlAttributes` instance may own several independently keyed allowlisted property
  projections on the same target without allocating a general property-contribution table or
  observing unrelated properties.
- Source fallback without the optional enhancement creates no message component, message context,
  descendant contribution table, formatter cache entry, or full effect scope beyond the ordinary
  authored fallback tree.
- Message projections bind directly to generated value vectors and stable structural factories. They
  do not inspect runtime children, materialize a second child graph, clone VNodes, mount hidden source
  output, or retain inactive branch output merely to preserve a translation slot. The selected source
  or translated plan is the only rendered child graph.
- Locale/catalog replacement releases the prior generation once no active SSR request, hydrated
  root, lazy artifact, refresh, or resumption checkpoint can reference it. Package catalogs must not
  become permanently process-global merely because their package was encountered once.
- Analyzer and language-tool message analysis should publish compact projections and participate in
  the language-service cache bounds rather than keep duplicate source text and full message plans
  for every closed file.

Message parameters and structural branches use a validated intl projection contract over ordinary
reactive values and analyzer-generated factories; they do not expose or mutate the standard
compiler's private render-program representation. Value updates publish to the affected formatted
text or selected branch. Locale changes reconcile the one active plan by stable binding/slot identity
rather than rebuilding hidden source output. Locale/catalog generation changes invalidate active
consumers through their registered owner and descriptor identities; they must not scan all mounted
components or every package catalog.
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

Any generator-selected Temporal or `Intl` capability provider is ready before the first dependent
client artifact evaluates or hydrates. Hydration identity records the capability/data generation,
not a CDN URL or polyfill implementation brand.

Lazy artifact plans pair code with the exact locale/message/unit-data fragments needed by that
artifact. Loading a lazy component under an existing locale fetches its matching fragment. Changing
locale invalidates or reloads only active catalog consumers and preserves component/DOM identity
when the translated structural-slot contract permits an in-place update.

Any measured structural render-program extension treats translated branch selection and
structural-slot ordering as analyzer-declared, renderer-owned range structure. A refresh may update
text or reorder authorized slots only within the message plan; it cannot patch through component
ownership or inject translator-defined markup. The current safe range and boundary replacement
paths already preserve this rule without requiring that optional optimization.

Microfrontend exposures publish message/catalog requirements through the shared artifact plan.
Page and component hosts agree on locale, catalog protocol, owner identity, Unicode-data version,
and provided `@exactjs/intl` instance before hydration. Remote catalogs cannot override unrelated
owners without an explicit application policy.

## Trust and security

Internationalization enhancement implementations are ordinary component-library code. If selected
into a server-executing artifact, the bundler applies the server component-library trust policy
before evaluation. Catalog data alone does not authorize or execute a component package.

The Vite, Bun, and Webpack `internationalization` option explicitly enables the same shared host
coordinator for catalog files, configuration, and translation interchange. It also authorizes only
the fixed native analyzer for application-owned source. Importing a component or catalog cannot
activate the option or authorize dependency-provided scripts. The compiler performs no intl trust
decision and runs no intl callback.

Catalog validation must enforce:

- bounded message, branch, nesting, locale, and catalog sizes;
- exact placeholder availability and compatible types;
- complete selector fallback;
- compatible formatter and unit dimensions;
- finite structural slots owned by authored code;
- only allowlisted human-facing intrinsic property projections, with no HTML/script interpretation
  or arbitrary URL, identity, form-state, style, handler, or attribute mutation;
- bidi isolation for substituted values where required;
- no server-only or secret value entering a client message parameter; and
- no filesystem path, package path, or source excerpt exposed as runtime identity.

Machine-generated or remotely supplied translations are untrusted data and pass the same build-time
and runtime boundary validation as local catalogs.

## Diagnostics and language tools

Under the generic
[trusted language-service contribution](trusted-language-service-contributions.md) contract, an
intl package owns the following assistance without adding an intl callback or semantic branch to
the standard compiler. The generic language host still does not assume that an intl package exists;
these capabilities appear only when `@exactjs/intl` is installed, selected, and trusted.

Intl analyzer and language-tool support should provide:

- completion and hover for finite `intl:*` activators and shared formatter props;
- canonical unit, display-name, currency, date/time, duration, relative-time, list, selector,
  semantic unit alias, and CLDR
  `<quantity>/<usage>` values;
- source-unit inference provenance showing typed, explicit, bounded-label, package, or source-locale
  convention;
- source-currency and display inference provenance showing typed, explicit, ISO-code, localized-name,
  symbol, and source-locale evidence;
- diagnostics for malformed formatter shapes, incompatible or unordered range endpoints,
  unsupported branch predicates, opaque producer calls, and ambiguous projection inference;
- inspection of inferred ordinal, range, Temporal, duration, relative-time, direct
  `Intl.DateTimeFormat`/Temporal `toLocaleString`, standard-`Intl`, and local pure data-flow
  projections;
- completion and diagnostics for allowlisted property-message activators and their finite
  `<role>:<selector>` descriptors;
- diagnostics for messages on ordinary component invocations, unnamed component ranges,
  unconstrained `props.children`, and attempts to cross opaque component boundaries;
- inferred placeholder names/types, optional readable message name, durable generic key, and exact
  execution-contract inspection;
- source-linked missing, obsolete, incompatible, duplicate, malformed-XLIFF, legacy-metadata, and
  source-locale-mismatch diagnostics;
- warnings for literal native formatter locales that contradict the configured authored source
  locale inside a message, without warning about dynamic locale expressions or ordinary code
  outside an intl region;
- package-owned catalog provenance, coverage, override origin, and published-subpath diagnostics;
- development-entry locale, dependency translation selection, and per-owner source fallback;
- catalog reachability and artifact ownership inspection;
- per-artifact generator capability requirements and selected native, bundled, self-hosted, or CDN
  provider provenance;
- locale/unit preview without mutating source; and
- pseudo-locale preview for expansion, bidi, and structural-slot stress.

The implemented first slice provides diagnostics, completions, hover, and inlay hints. It does not
provide message-to-source navigation or intl-specific code actions.

The language server follows its existing workspace trust boundary. It does not contact translation
services or execute workspace plugin code merely to provide message semantics.

## Testing strategy

Testing support should allow a component or application test to install a locale environment and
catalog explicitly. Source-fallback tests require no plugin host. Provide deterministic
pseudo-locales that expand text, preserve placeholders, exercise combining characters, and mirror
direction without altering component identity.

Verification must cover:

- normalized identity stability across formatting, source paths, and local variable renames;
- intentional key changes for translator-facing text, authored name, target, and generic placeholder
  changes;
- placeholder typing, reuse, structural slots, and catalog compatibility;
- source-local behavior with missing translations and unavailable enhancements;
- formatter fallbacks that retain authored currency, unit, range, duration, ordinal, and
  relative-time presentation when unavailable and replace the complete annotated projection without
  duplicated source markers, labels, or morphology when active;
- formatter-local fallback ternaries that reuse one value binding, target-locale plural morphology
  based on the final displayed quantity and visible fraction digits, and no accidental surrounding
  message selection;
- mixed-source-locale package graphs whose development entry selects dependency translations without
  introducing package-nested locale contexts;
- direct `_` enhancement composition with text, branches, and multi-node output;
- allowlisted intrinsic property messages, multiple canonical-deduplicated properties on one host,
  `<role>:<selector>` descriptors, property-level plural/unit/display-name inference, unavailable
  fallback, SSR/hydration adoption, and rejection of unsafe property targets;
- canonical `message`/`plural`/`select` deduplication, implicit message boundaries for selectors,
  one reactive selector read per update, and coalescing of repeated predicates without Cartesian
  message expansion;
- lexical intrinsic traversal without ordinary-component descent;
- direct intrinsic structural slots that preserve their semantic host, opaque exactly-once
  component slots, independently extracted descendant messages, and diagnostics for fragments
  outside a message;
- inferred boolean/exact branches, explicit plural/select analysis, nested finite decision trees,
  source-fallback ternaries, exact numeric cases, locale-specific categories,
  branch-inside/message-outside identity, and unsupported predicates;
- inferred cardinal/ordinal distinction, baseline, semantic-`sup`, and literal-Unicode superscript
  suffixes, unrestricted source-locale ordinal partitions, target-locale suffix placement/omission,
  ordinal range/category behavior, native cardinal/ordinal `selectRange()` lowering, and a
  representative multi-script locale matrix;
- number, display-name, currency, date/time, Temporal duration, relative-time, list, and bidi
  formatting;
- currency identity and symbol/code/name display inference from typed values and bounded authored
  fallback under the package source locale, including placement, name morphology, ambiguous symbols,
  explicit narrow-symbol policy, contradictions, and markerless strict-fallback diagnostics;
- scalar and source-shaped range projection, equal-endpoint collapse, ordering and finite-value
  validation, shared unit conversion, target punctuation/elision, and locale plural-range rules;
- direct `Temporal.Duration` projection, calendar-dependent `relativeTo` requirements, field
  preservation, duration ranges, and all supported Temporal date/time mappings;
- implicit date/time projection from direct and locally bound `Intl.DateTimeFormat().format`,
  compatible `formatRange`, and Temporal `toLocaleString` calls, including finite option retention,
  source-locale validation, target-locale substitution, and rejection of nondeterministic defaults
  or opaque formatted-output manipulation;
- the required nested duration fallback fixture that selects the first nonzero field, coalesces
  repeated reads and plural suffixes, preserves authored priority/sign/zero semantics, and lowers to
  one relative-time decision projection;
- the equivalent local-array/`find`/`Math.abs`/`Intl.RelativeTimeFormat` fixture, including literal
  unit-union flow, source-locale validation, pure helper summarization, and opaque imported-helper
  rejection without a published analyzer contract;
- intrinsic formatter projections that preserve host identity, authored properties, events, refs,
  ownership, and `_target` contribution layers;
- semantic unit aliases, bounded source-label and typed source-unit inference, contradiction and
  ambiguity diagnostics, CLDR-pair normalization, dimensional validation, offset/compound/mixed
  conversion, thresholds, user policy, translation overrides, fixed `convert-to` precedence,
  rounding, and negative values;
- identical SSR/hydration locale, catalog, unit data, and output adoption;
- lazy locale fragments, locale-switch cancellation, stale generation fencing, and cleanup;
- per-artifact client capability inference, native-target elision, bundled/self-hosted/pinned-CDN
  provider selection, deduplication, pre-evaluation ordering, CSP/failure policy, lazy loading, and
  absence of a legacy Node Temporal polyfill path;
- refresh, partial resumption, and heterogeneous microfrontend catalog agreement;
- unauthorized server component-library, analyzer, and plugin rejection before evaluation;
- adversarial catalog size, nesting, HTML, slot, unit, and placeholder inputs; and
- package fixtures whose own source and translated catalogs are published, selectively linked,
  overridden by an application, omitted when unreachable, and rejected when their manifest or
  package contents disagree.

## Implemented architecture and acceptance gate

The repository now contains protocol-1 contracts, canonical keys, bounded validators, prepared
activation/runtime, finite boolean/exact/cardinal/ordinal and two-binding plural-range fallback
lowering with shared bindings, static native-`Intl` source-locale consistency diagnostics,
direct-intrinsic target/element factories, native currency/date-time/range/relative-time/display-name/
unit/list recognition, typed Temporal and relative-duration projection, semantic and exact-CLDR
unit formatting, pinned CLDR 48 region/usage/magnitude preferences, Unicode measurement-system
overrides, application preferences, mixed length/mass output, and conversions for
length, temperature, area, mass, volume, speed, pressure, energy, power, road fuel economy, and
digital storage, plus opt-in Vite, Bun, and Webpack pre-compiler handoffs. The shared host coordinator
emits validated component-owned descriptor/catalog companions with
generation fencing, joins analyzer-local ownership to public compiler component facts, and relinks
watched XLIFF 2.1 or protocol-JSON catalog files without recompiling component source. Architecture fixtures prove source
fallback, translated cardinal selection, structural identity, DOM updates, synchronous SSR,
hydration adoption, atomic locale replacement, and removal of an unused component's message from a
shared source module. The compiler's message integration remains limited to generic component-brand
and target contracts; separately, its ECMA-402 optimization lowers proven native formatter
operations to core's shared cache. It emits no intl message, locale, catalog, or CLDR protocol.
Protocol growth remains additive or versioned and must continue to pass the full gate.

The implementation uses protocol 1 descriptors and prepared activations throughout. Its current
bounded contracts are:

- application-owned source modules and one package source locale;
- one shared build coordinator projected through Vite, Bun, and Webpack lifecycles;
- native-`Intl` source-locale evidence plus a bounded source-language inference registry covering
  English and sixteen additional common developer languages; profiled unit, currency,
  default-marker, finite ordinal-marker, and ordinal-wrapper shorthand remains extensible without
  changing native semantic analysis;
- content messages on direct intrinsics and `_`, plus allowlisted intrinsic-property messages;
- normalized text, scalar string/number bindings, one direct intrinsic element binding, finite
  boolean/exact selection, cardinal plural selection, and analyzer-proven ordinal selection;
- fallback- and source-locale-inferred currency, standard finite `Intl` projections, compatible date
  ranges, Temporal locale formatting, direct duration values, and finite relative-duration fallback
  or source-local helper summarization;
- `display-name:<selector>` roles on allowlisted intrinsic properties;
- semantic aliases and exact CLDR selectors for the implemented length, temperature, area, mass,
  volume, speed, pressure, energy, power, road-fuel-economy, and digital-storage domains;
  source-unit label/source-locale inference, fixed `convert-to`, locale/application preferences,
  mixed foot/inch presentation, and bounded multiplicative, offset, and reciprocal conversions;
- targetless XLIFF 2.1 source-message extraction, bilingual XLIFF as the persisted translation
  source of truth synchronized without discarding compatible targets, notes, or state and without
  retaining obsolete units, and
  one validated derived runtime IR with a protocol-JSON adapter for generated integrations;
- DOM rendering, synchronous SSR, hydration adoption, reactive value updates, one atomic locale
  change, missing-message fallback, and source-linked diagnostics; and
- watch invalidation for source and catalog edits with generation fencing.

Catalog-only watch invalidation is now executable: the adapter reloads all configured catalog files,
revalidates and re-slices each retained companion, advances the generation, and invalidates the
virtual modules. It does not rerun the analyzer or ordinary compiler for that edit.

Component-level pruning is also executable. The analyzer splits descriptor imports by source-local
component owner, the linker verifies those owners against public compiler facts, and Vite marks each
virtual component companion side-effect-free when none of its exports are referenced. Generic
tree-shakeable component-brand attachments then let Rollup remove the unused component and its
descriptor/catalog companion together.

Installed dependencies may publish inert message contracts and locale catalogs through fixed
package metadata; selected locales are loaded through bounded public exports without evaluating
package code. Per-module client requirements now let the shared generator select native support, a
bundled side-effect module, or a pinned HTTPS CDN provider without changing analyzer output. Client
providers run before their dependent descriptor companions; CDN loads require Subresource
Integrity, share a global promise across independently loaded artifacts, propagate load failure,
and remain subject to the application's Content Security Policy. Server companions emit no provider
path. Lazy artifact placement, refresh, resumption, and microfrontend coordination use the same
descriptor, generation, authorization, and capability contracts rather than a separate intl
design.

The shared coordinator also resolves an omitted application owner and source locale from inert
entry-package metadata. That source locale is the default development target unless
`developmentLocale` overrides it; dependency descriptors continue to use their independently
published owner and source locale.

The architecture gate passes only when one fixture proves all of the following:

1. Removing or disabling intl analysis sends the original source through ordinary compilation and
   produces the normal authored fallback without an intl runtime import, prepared activation, or
   catalog fragment.
2. Enabling intl emits source-mapped prepared activations, and the standard compiler requires no new
   intl role, opcode, output field, or private-plan consumer.
3. Each reactive value and selector is evaluated once per message update; the runtime evaluates no
   authored expression and discovers no text or structural slot by walking rendered children.
4. A translated direct intrinsic element preserves its authored props, event/ref behavior, key,
   ownership, and DOM identity while moving within the translated pattern.
5. Source fallback, SSR, hydration, client updates, and locale replacement use the same descriptor,
   binding indexes, catalog generation, and output semantics.
6. Source edits invalidate analysis and compilation for the affected module; catalog-only edits
   relink the affected locale projection without recompiling application source; stale generations
   cannot publish.
7. Malformed catalogs, descriptor/runtime version mismatch, missing prepared-runtime linkage,
   duplicate identity disagreement, and unauthorized analyzer execution fail before application
   evaluation.

The component reachability gate is satisfied for ordinary Vite production tree shaking: a real
bundler fixture imports one of two components from the same analyzed module and proves that only the
selected component's source descriptor remains. Future lazy, refresh, resumption, and published
package artifacts must preserve the same component-owned companion boundary rather than falling
back to source-module retention.

If an architecture gate cannot be met, implementation stops and records the smallest missing generic build
or compiler contract. Any proposed addition must be useful beyond intl—for example, a public
source-transform ordering hook or stable component-identity service—and must be reviewed separately.
The implementation must not solve failure by adding message, catalog, translation, unit-policy, or
CLDR fields to standard compiler output. Cache lowering may target the public core Intl facade
because that operation is useful to ordinary compiled TypeScript independently of translation.

## Delivery order

1. Freeze the protocol-1 authoring unions, lexical boundaries, prepared-activation binding contract,
   portable IR, canonical identity serialization, source instrumentation, and generated-module
   schemas defined above.
2. Implement and evaluate native analysis through Vite, Bun, and Webpack against the architecture
   gate without changing standard compiler output or consuming private render-program opcodes.
3. Replace initial module-level retention with component-level linking through public component IDs
   and artifact-graph facts, then publish the analyzer/runtime schema compatibility matrix.
4. Add analyzer and language-tool support for intrinsic content/property regions, formatter value
   shapes, display names, named intrinsic and opaque structural slots, inferred boolean/exact and
   ordinal branches, Temporal projections, ranges, local pure data flow, standard `Intl` operations,
   and the shared message/select/plural component contract. Define formatter-local morphology
   separately from message selection.
5. Implement explicit source-local components, allowlisted intrinsic-property activators, and
   enhancement export maps over one shared runtime.
6. Add per-package source locale/unit conventions, catalog extraction, component-library publication
   metadata, application override merging, missing/obsolete diagnostics, and pseudo-locales.
7. Implement versioned Unicode unit conversion/preferences, duration/relative/ordinal/range
   projections, and display names with artifact-level data slicing and adversarial conformance tests.
8. Add shared host configuration, declarative generator capability requirements, and
   build/server/render/client/testing projections without a compiler callback surface.
9. Coordinate development-entry locale selection, dependency translation lookup, runtime locale
   negotiation, SSR, hydration, reactive locale changes, lazy catalog fragments, and generation
   fencing.
10. Integrate microfrontend artifact contracts and expose the same facts to any later measured
    structural render-program extension.
11. Add current engineering references, package READMEs/local agent guidance, docs-app pages,
    examples, and translation-tool adapter documentation when implementation lands.

## Acceptance criteria

1. Components can author complete content and allowlisted intrinsic-property messages through
   `intl:*` enhancements without manual message IDs, binding maps, or formatter calls.
2. Authored JSX and TypeScript remain the direct local and unavailable-enhancement behavior; an
   active missing translation executes the analyzer-emitted source plan.
3. The generic translator-facing text, target, and placeholder guide determine the catalog hash,
   which remains stable across source relocation, local renaming, and exact execution-lowering
   changes. `intl:message="name"`, `name` in finite value-bearing activators, and the explicit
   component's `name` prop add a readable normalized prefix; there is no standalone `intl:name`
   enhancement or mandatory handwritten message ID. The untruncated base64url SHA-256 key has no
   speculative contract-version prefix. A separate hash identifies exact execution semantics.
4. Message analysis follows locally authored intrinsic, fragment, scalar, structured-value, finite
   branch, and pure local producer graphs but never recursively expands an ordinary component
   implementation.
5. Ordinary component invocations and `props.children` enter a message only as explicitly named,
   opaque, exactly-once structural slots; descendant messages remain independently owned.
6. Inferred boolean/exact and explicit plural/select regions lower analyzer-proven ordinary code
   into finite decision trees while preserving source execution; `plural` and `select` establish one
   canonical message instance, evaluate one selector binding per update, and avoid Cartesian case
   expansion. Static `Intl.PluralRules.selectRange()` lookups retain two selector bindings and one
   target-locale cardinal or ordinal range decision.
7. The required nested `Temporal.Duration` fallback selects the first authored nonzero field,
   coalesces repeated reads and formatter-local morphology, preserves priority/sign/zero behavior,
   and lowers to one relative-time decision projection with a translated literal fallback leaf.
8. An equivalent local finite array, pure `find`, `Math.abs`, and
   `Intl.RelativeTimeFormat(sourceLocale)` producer lowers to the same projection; opaque imported
   helpers require a published analyzer contract and effectful or unbounded producers are rejected.
9. A plain number remains cardinal unless analyzer-proven fallback use establishes ordinal intent;
   finite and unrestricted source-locale ordinal partitions lower to target ordinal rules without
   treating English suffix conditions as universal categories. Direct semantic `sup` wrappers and
   equivalent literal Unicode superscript suffixes establish the same projection while retaining a
   suffix-only superscript presentation preference; target grammar may relocate or omit the suffix.
10. `Temporal.Duration` directly used in a message selects a duration projection, while explicit
    duration-purpose options remain available through the canonical Unit component; other Temporal
    types select their corresponding date/time projections and calendar-dependent balancing requires
    an explicit `relativeTo` reference. A recognized Temporal value passed directly through
    `Intl.DateTimeFormat().format`, compatible `formatRange`, or Temporal `toLocaleString` implicitly
    supplies the appropriate projection and finite presentation options without another enhancement;
    static authored locales are checked for compatibility with the package source locale, and the
    active locale replaces that validated source-locale formatting while authored code remains the
    fallback.
11. `intl:unit="<semantic-purpose>"` and exact
    `intl:cldr="<quantity>/<usage>"` values activate one canonical Unit component without selecting a
    measurement system. Typed values, an explicit disambiguator, a bounded compatible fallback
    label, or package policy resolves the separately recorded source unit, and contradictions are
    diagnostics.
12. One compatible scalar denotes a value and two compatible endpoints in a recognized authored
    shape denote a range without `intl:range`; active formatting converts them together, collapses
    equal endpoints, validates ordering/finiteness, localizes punctuation/elision, and applies plural
    range rules.
13. Formatter-local singular/plural, ordinal, range, duration, and relative-time presentation is
    retained for fallback and replaced as one typed projection when active. It uses final displayed
    operands where appropriate without implicitly selecting unrelated surrounding prose.
14. `display-name` formats validated language, region, script, currency, calendar, and date/time-field
    codes as a standalone typed projection and remains distinct from number-sensitive currency
    quantities.
15. Finite property activators such as `intl:aria-label` and `intl:placeholder` share one canonical
    `IntlAttributes` instance, retain independent message identities, accept the same inferred
    projections and finite `<role>:<selector>` descriptors as content, preserve authored fallbacks,
    and cannot target unsafe properties.
16. Content and property projections attached to an intrinsic preserve that element's semantic
    identity, unrelated properties, events, refs, ownership, and `_target` contribution layers.
17. Explicit intl-role components and enhancement forms share ordinary inspectable component
    implementations, context, tasks, ownership, placement, cleanup, and message IR.
18. Published component libraries can carry message contracts and package-owned translations without
    requiring consuming applications to activate intl; consuming builds link only selected locales
    and reachable messages and retain deterministic application override authority. Their
    protocol-1 package metadata uses the fixed `protocol`, `sourceLocale`, `sourceUnits`, `messages`,
    and `catalogs` fields and only bounded public export subpaths.
19. The explicitly trusted intl source stage emits source-mapped prepared activations containing one
    explicit reactive binding vector and stable structural factories. The standard compiler processes
    them as ordinary enhancement props and emits no internationalization semantics; the linker joins
    public component IDs and artifact facts without executing application components or consuming
    private compiler operations.
20. The intl plugin forwards per-artifact client requirements such as Temporal through a general
    declarative generator capability contract. Native targets emit nothing; configured bundled,
    self-hosted, or pinned-CDN providers load before dependent evaluation, deduplicate across
    requesters, obey CSP/failure policy, and add no legacy Node Temporal polyfill path.
21. The bundler emits protocol-compatible runtime descriptors indexed by occurrence and validated
    catalogs indexed by locale, owner, and key, plus only reachable formatter code, Unicode data,
    environment capabilities, and independently loaded lazy fragments.
22. Each package owns an independent source locale; a development entry defaults its one root target
    locale from the entry package and resolves dependency translations without component-level
    locale providers.
23. Currency formatting infers identity and symbol/code/name presentation from typed or explicit
    facts and bounded fallback evidence under the package source locale, diagnoses ambiguity and
    contradictions, and never performs implicit exchange-rate conversion. Unit formatting performs
    only dimensionally valid conversion with supported mixed/offset behavior; a static `convert-to`
    is a fixed destination override, while its absence permits deterministic
    application/user/translation/CLDR destination policy.
24. SSR, hydration, locale changes, lazy loading, refresh, resumption, and microfrontends agree on
    locale, catalog, Unicode data, capability, authorization, ownership, and generation identities.
25. Translator-controlled data cannot inject executable code, HTML, component identity, unsafe
    properties, handlers, URLs, secrets, or unauthorized structural output.
26. Server-executing intl components pass component-library authorization before evaluation; the
    explicit host option is the build-code/host authorization for the fixed analyzer and shared
    coordinator, and no dependency-provided analyzer script is executable.
27. Analyzer, language-tool, runtime, conversion, generator, bundler, SSR, hydration, lazy, refresh,
    resumption, microfrontend, security, package, and documentation verification passes.
28. The shared Vite, Bun, and Webpack integration passes every architecture-gate fixture before the
    analyzer or runtime is published, including zero-intl fallback, no compiler output change, single binding
    evaluation, structural identity, SSR/hydration agreement, incremental invalidation, generation
    fencing, pre-evaluation validation, and component-level reachability before production delivery.

import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';
import {
	intlConfigurationSource,
	intlCardinalSource,
	intlDurationSource,
	intlFormattersSource,
	intlMessageSource,
	intlOrdinalSource,
	intlPropertiesSource,
	intlStructureSource,
	intlUnitsSource,
	intlXliffSource
} from './internationalization-sources.js';

/** Documents the experimental enhancement-first internationalization implementation. */
export function InternationalizationPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Plugin + enhancement / @exactjs/intl"
			title="Localize ordinary TSX with semantic intent"
			description="The intl plugin coordinates analysis, XLIFF catalogs, bundlers, and runtime locale data; its enhancement surface keeps that machinery nearly invisible in application components."
			previous={{ path: '/plugins', label: 'Plugin system' }}
			next={{ path: '/plugins/microfrontends', label: 'Microfrontends' }}
		>
			<Callout tone="warning" title="Experimental API">
				The implementation is still pre-stable. Message IR and catalog inputs are validated build
				contracts; application code should use the public components, enhancements, and environment.
			</Callout>
			<section>
				<h2>Compare locale structure side by side</h2>
				<p>
					The repository&apos;s <code>apps/intl-testbed</code> renders English, French, Japanese,
					and Arabic from the same reactive values. Colored intrinsic and opaque fragments expose
					catalog-driven reordering directly, alongside plural, ordinal, unit, date, duration,
					property, lazy-catalog, and ordinary unenhanced-content scenarios. The latter demonstrates
					that content outside an intl enhancement never enters the translation workload. Run it
					with <code>npm run dev:intl</code>.
				</p>
			</section>
			<section>
				<h2>Messages stay ordinary TSX</h2>
				<CodeBlock source={intlMessageSource} language="tsx" title="Greeting.tsx" />
				<p>
					Analysis follows locally authored text, shared scalar values, finite branches, cardinal
					fallback ternaries, and direct intrinsic children. It does not expand
					<code>UserName</code>
					or another ordinary component implementation. If analysis is disabled or a region is
					unsupported, the authored children remain the output.
				</p>
				<p>
					A component range can be wrapped in a named <code>intl:fragment</code>. Translation may
					move that exactly-once opaque slot, while analysis leaves its component and independently
					owned messages untouched.
				</p>
				<CodeBlock source={intlStructureSource} language="tsx" title="Transfer.tsx" />
			</section>
			<section>
				<h2>Intent comes from ordinary fallbacks</h2>
				<p>
					Finite ordinal marker branches and wrappers, typed Temporal values, date ranges,
					relative-duration fallbacks, and standard <code>Intl</code> calls become typed formatter
					plans. Superscript ordinal structure remains structure; target locales still apply their
					own ordinal rules.
				</p>
				<p>
					Core message analysis is source-language independent. Unit labels come from the build
					host&apos;s native <code>Intl.NumberFormat</code> locale data, while CLDR-backed Go data
					resolves likely regions and conventional currencies. English suffix ternaries remain a
					convenient compatibility form; a static <code>Intl.PluralRules</code> category lookup is
					the generic, preferred way to express unrestricted ordinal intent.
				</p>
				<p>
					Static cardinal <code>Intl.PluralRules</code> category maps are supported as well. The
					test bed compares Arabic, Polish, French, and Hindi under one reactive count, including
					Arabic&apos;s six-way and Polish&apos;s four-way cardinal systems. Currency names and
					symbols are likewise profiled from native <code>Intl.NumberFormat.formatToParts()</code>,
					so localized fallback labels infer currency identity and display without per-language
					parsers.
				</p>
				<CodeBlock source={intlCardinalSource} language="tsx" title="Inbox.pl-PL.tsx" />
				<CodeBlock source={intlOrdinalSource} language="tsx" title="Placement.en-US.tsx" />
				<p>
					A static <code>rules.selectRange(start, end)</code> category lookup uses one native
					plural-range decision for the active locale, with cardinal and ordinal rules supported.
					Authored native <code>Intl</code> locales are checked against the package source locale:
					language-only tags may omit specificity, while conflicting languages or regions produce a
					source-linked diagnostic.
				</p>
				<p>
					Generic native <code>Intl</code> profiles provide source-locale unit and currency
					evidence. Additional authored-language shorthand is isolated in a bounded language-profile
					registry covering English plus sixteen common developer languages. Profiles recognize
					finite ordinal words and distinctive suffix-only, prefix-only, or prefix/value/suffix
					forms, including <code>第{'{position}'}位</code> and <code>ke-{'{position}'}</code>,
					without turning one language&apos;s grammar into a universal rule.
				</p>
				<p>
					A semantic <code>intl:unit="distance-road"</code> region can contain one value or a range
					and an ordinary source label such as <code>miles</code>. The same enhancement style covers
					area, mass, volume, speed, pressure, energy, power, road fuel economy, digital storage,
					and temperature. The analyzer records purpose separately from the source measurement
					system. The runtime supports locale preferences, application/user overrides, mixed output,
					and dimension-checked <code>intl:convert-to</code> conversion, including offset and
					reciprocal formulas.
				</p>
				<CodeBlock source={intlUnitsSource} language="tsx" title="Measurements.tsx" />
				<p>
					Automatic destination units come from Unicode CLDR 48 preference data rather than a
					US/GB/rest heuristic. Selection uses semantic quantity, usage, maximized locale region,
					Unicode region and measurement-system overrides, and evaluated magnitude thresholds. CLDR
					compound destinations produce mixed units such as feet/inches or meters/centimeters;
					explicit application policy still takes priority, and <code>intl:convert-to</code> remains
					fixed.
				</p>
				<p>
					Native <code>Intl.NumberFormat</code> provides unit formatting wherever ECMA-402 exposes
					the unit. For unsupported engineering units such as <code>kPa</code>, <code>kWh</code>,
					and
					<code>hp</code>, eXact retains native number, spacing, placement, and bidi formatting
					while using the standardized symbol. Case-sensitive source labels distinguish values such
					as
					<code>Mb</code> and <code>MB</code>.
				</p>
				<p>
					Currency display is likewise inferred from <code>$</code>, <code>USD</code>, a long
					currency name, or the package source locale. A bare currency activation in an
					<code>en-US</code>
					package therefore implies USD symbol presentation.
				</p>
				<CodeBlock source={intlFormattersSource} language="tsx" title="Receipt.tsx" />
				<p>
					Conversion preserves evaluated source precision unless explicit digit options override it,
					and rounding occurs after conversion. CLDR chooses the destination and threshold, while
					eXact&apos;s source-precision contract controls rounding; a range uses the largest
					absolute endpoint so both endpoints share one unit. A finite nonzero result retains enough
					fraction digits to avoid displaying zero.
				</p>
				<p>
					Whole-number <code>12-18 miles</code> becomes <code>19-29 kilometers</code>.
				</p>
				<p>
					Similarly, <code>72 °F</code> becomes <code>22 °C</code>.
				</p>
				<CodeBlock source={intlDurationSource} language="tsx" title="Published.tsx" />
			</section>
			<section>
				<h2>A build stage before the compiler</h2>
				<CodeBlock source={intlConfigurationSource} language="ts" title="vite.config.ts" />
				<p>
					The analyzer emits canonical protocol-1 descriptors and prepared props. The normal eXact
					compiler then sees an ordinary trusted enhancement component, reactive values, and
					functions. Shared companion modules validate and register reachable catalog slices in
					Vite, Bun, and Webpack; the compiler output contains no locale, message, catalog, or CLDR
					protocol.
				</p>
				<p>
					The intl runtime is published as a standard compiled eXact component library. Its normal
					build facts carry component identity, and <code>@exactjs/intl/enhancements</code> exports
					the namespaced message, selection, formatter, CLDR, and translated-property enhancements.
					No compiler or Suspense allowlist is specific to intl.
				</p>
				<p>
					Native <code>Intl</code> formatter instances are reused by a bounded, lazily created cache
					owned by each provider environment. That keeps formatter lifetime with the language
					context, avoids unused formatter construction, and avoids process-global locale state.
				</p>
				<p>
					Each message is joined to a public compiler component identity after compilation. Watched
					XLIFF or protocol-JSON catalog files can then relink and invalidate the generated
					companions without recompiling component source. Component-owned companions also let the
					bundler remove an unused component's messages from a shared source module.
				</p>
				<p>
					An entry package may omit build-local owner and source-locale options when its package
					metadata declares them. Its source locale becomes the default development target, while
					dependency messages retain their own package identity and fallback locale.
				</p>
			</section>
			<section>
				<h2>Publish and exchange catalogs</h2>
				<CodeBlock source={intlXliffSource} language="xml" title="translations/en-US.xlf" />
				<p>
					The workflow begins with a targetless XLIFF extraction: analyzed TSX becomes
					<code>&lt;source&gt;</code> units with <code>srcLang</code>, placeholders, branches, and
					structural inline codes, but no chosen target locale or invented translations. That file
					omits standalone formatter/value descriptors because locale-aware runtime formatting is
					not translation work; the same placeholders remain when embedded in linguistic content.
					Naming the request after its source locale, such as <code>en-US.xlf</code>, keeps it
					aligned with the destination catalog names; the absence of <code>trgLang</code>
					distinguishes it. The file can be sent to an AI service, translation platform, or human
					translator. Each returned locale file adds <code>trgLang</code> and translated
					<code>&lt;target&gt;</code> units.
				</p>
				<p>
					Dependencies may publish inert message contracts and selected locale catalogs through
					fixed package metadata. The build coordinator discovers and validates those public data
					exports without evaluating package code. XLIFF 2.1 is the persisted translation source of
					truth: ordinary text and standard inline codes remain visible to translation tools, while
					bounded eXact metadata preserves bindings and formatter intent. That metadata lives in
					standard <code>originalData</code> entries referenced by <code>dataRef</code>, not in
					foreign XML attributes. Required codes cannot be copied or deleted, but translators may
					still reorder them. The files use XLIFF 2.1&apos;s unchanged 2.0 core namespace and are
					validated against its official schema. Synchronization keeps targets, notes, review state,
					and obsolete history. Protocol JSON is derived runtime data for generated integrations,
					and every import lowers into the same validated message IR. Regional targets fall back
					through matching script and language catalogs. Existing root environments also adopt
					validated descriptor/catalog slices when a lazy component companion arrives.
				</p>
			</section>
			<section>
				<h2>Translate selected intrinsic properties</h2>
				<CodeBlock source={intlPropertiesSource} language="tsx" title="Search.tsx" />
				<p>
					Human-facing properties such as <code>placeholder</code>, <code>alt</code>,
					<code>title</code>, and selected ARIA text can carry independent message boundaries. The
					authored property remains the fallback; an active translation replaces only that value and
					preserves the intrinsic, events, refs, and unrelated properties.
				</p>
				<p>
					Formatter roles use the same namespaced form. For example,
					<code>intl:aria-label="display-name:languageCode"</code> turns a language code fallback
					into a localized display name without a separate runtime mini-language.
				</p>
			</section>
			<section>
				<h2>Polyfills are a generator decision</h2>
				<p>
					Every adapter reports finite <code>temporal</code> and <code>intl-duration-format</code>
					client requirements for each analyzed module. Shared
					<code>clientCapabilityProviders</code> configuration can satisfy them natively, with a
					bundled module, or with a pinned HTTPS CDN script allowed by the application&apos;s CSP. A
					provider runs before its dependent client companion and CDN loads deduplicate globally.
					Server builds emit no polyfill, and the analyzer never embeds a provider or URL.
				</p>
			</section>
			<section>
				<h2>Validated translation plans</h2>
				<p>
					A root <code>IntlProvider</code> owns the reactive locale and catalogs. Catalog patterns
					may reorder declared values and direct intrinsic factories, but cannot inject executable
					code, HTML, component identities, handlers, URLs, or undeclared bindings. Missing messages
					use the analyzed source plan.
				</p>
			</section>
		</Article>
	);
}

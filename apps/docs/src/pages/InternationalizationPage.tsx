import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import {
	intlConfigurationSource,
	intlCardinalSource,
	intlCacheSource,
	intlCompositionSource,
	intlDurationSource,
	intlFormattersSource,
	intlLanguageToolsSource,
	intlLocaleSource,
	intlMessageSource,
	intlOrdinalSource,
	intlPropertiesSource,
	intlStructureSource,
	intlUnitsSource,
	intlXliffSource
} from './internationalization-sources.js';

/** Explains how to localize an eXact application. */
export function InternationalizationPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Plugin + enhancement / @exactjs/intl"
			title="Localize with intent"
			description="Translate TSX, format locale-aware values, manage XLIFF catalogs, and preview coverage in the editor."
			previous={{ path: '/plugins', label: 'Plugin system' }}
			next={{ path: '/plugins/microfrontends', label: 'Microfrontends' }}
		>
			<section>
				<h2>Compare locale structure side by side</h2>
				<p>
					The repository&apos;s <code>apps/intl-testbed</code> renders English, French, Japanese,
					and Arabic from the same reactive values. Colored intrinsic and opaque fragments expose
					catalog-driven reordering directly, alongside plural, ordinal, unit, date, duration,
					property, lazy-catalog, and ordinary unenhanced-content scenarios. The latter demonstrates
					that content outside an intl enhancement never enters the translation workload. Run it
					with <code>npm run dev:intl</code>, or{' '}
					<a href="./intl/">open the deployed Intl Testbed</a>.
				</p>
			</section>
			<section>
				<h2>See inferred intent and translation coverage in the editor</h2>
				<CodeBlock source={intlLanguageToolsSource} language="ts" title="exact.config.ts" />
				<p>
					The Node-only intl language provider reuses the native build analyzer through eXact&apos;s
					generic trusted language-extension host. Hovering an <code>intl:*</code> activation shows
					the durable key, source locale, target, inferred plural, formatter, temporal, currency, or
					semantic-unit behavior, and every configured JSON or XLIFF locale containing that key.
				</p>
				<p>
					The package-scoped enhancement export makes <code>intl:*</code> available without a
					per-component import and asks the provider to inspect every compiled component for
					linguistic content that may have been missed.
				</p>
				<p>
					Invalid message shapes are editor and build errors. Required locales can produce missing
					translation warnings, semantic unit values receive completions, and concise hints
					summarize inference inline. Source fragments that prove an inference are underlined; hover
					the fallback text, authored branch, Temporal value, or native <code>Intl.*</code>
					expression to see what was recognized. The host, analyzer, and catalog reads never enter
					the browser bundle.
				</p>
				<p>
					Likely linguistic JSX text and supported intrinsic properties outside their intl
					enhancements receive a <code>missing-intl</code> warning. The standard inherited HTML
					<code>translate=&quot;no&quot;</code> attribute marks intentional exclusions.
					<code>lang</code>
					and <code>dir</code> describe content but do not opt it out of translation.
				</p>
			</section>
			<section>
				<h2>Locale scopes set language metadata correctly</h2>
				<CodeBlock source={intlLocaleSource} language="tsx" title="LocalizedRoot.tsx" />
				<p>
					A valueless <code>intl:locale</code> reuses the nearest environment. A locale value reuses
					that environment&apos;s cached locale scope or creates a zero-configuration environment
					when there is no provider. The enhancement projects reactive <code>lang</code> and
					<code>dir</code> attributes during SSR, hydration, and client updates.
				</p>
				<p>
					Locale literals use a CLDR-backed <code>IntlLocaleString</code> type and receive exact BCP
					47 validation from the intl language integration. Use <code>defineIntlLocale()</code> to
					validate and narrow route, header, or user-provided strings.
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
					owned messages untouched. The field is compile-time analyzer metadata, so it is validated
					and removed without mounting another runtime enhancement.
				</p>
				<CodeBlock source={intlStructureSource} language="tsx" title="Transfer.tsx" />
				<h3>Compose one lexical message</h3>
				<p>
					Nested <code>intl:plural</code>, <code>intl:select</code>, currency, unit, and CLDR roles
					contribute selectors and formatters to their nearest <code>intl:message</code>. The
					analyzer prepares one descriptor and extraction produces one translator-reorderable XLIFF
					unit. A standalone specialized role creates an implicit message scope instead.
				</p>
				<CodeBlock source={intlCompositionSource} language="tsx" title="Delivery.tsx" />
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
					analyzer fixtures cover Arabic, Polish, French, and Hindi source packages, including
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
					source-linked error.
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
				<p>
					Place a formatter enhancement on its intrinsic host when it owns that element&apos;s
					complete content. Reserve the <code>_</code> fragment form for a narrower inline range,
					multiple independent formatter regions in one host, or content without an appropriate
					semantic host.
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
				<h2>Configure internationalization</h2>
				<CodeBlock source={intlConfigurationSource} language="ts" title="vite.config.ts" />
				<p>
					Set the source locale, supported locales, and catalog paths in the build integration. Vite,
					Webpack, and Bun use the same options.
				</p>
				<p>
					Import <code>@exactjs/intl/enhancements</code> for messages, selections, formatters, and
					translated properties. Native <code>Intl</code> formatters are cached automatically.
				</p>
				<CodeBlock source={intlCacheSource} language="tsx" title="Formatting.tsx" />
				<p>
					Components use the active locale. Helpers without a component can import the public
					<code>intl</code> facade.
				</p>
			</section>
			<section>
				<h2>Publish and exchange catalogs</h2>
				<CodeBlock source={intlXliffSource} language="xml" title="translations/en-US.xlf" />
				<p>
					Extract a source XLIFF file, send it to a translation service or translator, then add one
					returned file per locale. Placeholders and movable inline content remain explicit.
				</p>
				<p>
					XLIFF 2.1 is the editable translation source. Catalog synchronization keeps compatible
					targets and notes, removes obsolete messages, and validates required placeholders. Regional
					locales fall back through matching script and language catalogs.
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
					Within a named content message, property keys inherit a readable message-and-property
					prefix such as <code>account_placeholder</code>. Each property still hashes its own
					generic text and placeholder contract, and an explicit property-level name overrides the
					derived prefix.
				</p>
				<p>
					Formatter roles use the same namespaced form. For example,
					<code>intl:aria-label="display-name:languageCode"</code> turns a language code fallback
					into a localized display name without a separate runtime mini-language. This is a
					formatter-only descriptor backed by locale data, so it needs no XLIFF unit and its editor
					hint reports translation coverage as not applicable.
				</p>
			</section>
			<section>
				<h2>Configure required polyfills</h2>
				<p>
					Use <code>clientCapabilityProviders</code> to supply Temporal or Intl.DurationFormat from
					the browser, a bundled module, or a pinned HTTPS script allowed by your CSP.
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

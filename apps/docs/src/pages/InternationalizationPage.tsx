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
			title="Translate messages and format values"
			description="Translate messages and format numbers, dates, and units for the reader’s language and region."
			previous={{ path: '/plugins', label: 'Plugin system' }}
			next={{ path: '/components/trust', label: 'Server trust' }}
		>
			<section>
				<h2>Keep a translated sentence together</h2>
				<p>
					Translating a sentence can change word order, plural forms, and where a link or price
					belongs. Splitting it into separate strings makes that harder for translators. With
					<code>@exactjs/intl</code>, mark the whole message in JSX. eXact extracts its text and
					structure so translations can rearrange the parts while your component keeps its behavior.
				</p>
				<p>
					In this greeting, the translator can move the name and terms link within the sentence.
					<code>IntlProvider</code> supplies the active language and translations to its children.
					<code>intl:message</code> marks the content to translate.
				</p>
				<CodeBlock source={intlMessageSource} language="tsx" title="Greeting.tsx" />
				<p>
					A <strong>locale</strong> identifies a language and, when needed, a region, such as
					<code>fr-FR</code>. A <strong>catalog</strong> maps message identifiers to translations.
					Without a matching translation, the greeting uses its authored source text.
				</p>
			</section>
			<section>
				<h2>Configure languages and catalogs</h2>
				<p>
					Configure the language you write in, the locales you offer, and the translation files your
					build should load. Vite, Webpack, and Bun use the same internationalization options.
					Import <code>@exactjs/intl/enhancements</code> for the JSX attributes, or expose them
					package-wide through the configuration shown later in this guide.
				</p>
				<CodeBlock source={intlConfigurationSource} language="ts" title="vite.config.ts" />
				<p>
					The example also supplies a Temporal polyfill. If your browser targets need Temporal or
					<code>Intl.DurationFormat</code>, use <code>clientCapabilityProviders</code> to choose a
					browser implementation, a bundled module, or a pinned HTTPS script allowed by your CSP.
				</p>
			</section>
			<section>
				<h2>Send messages to a translator</h2>
				<p>
					Extract a source XLIFF file, send it to a translator or translation service, then add the
					returned files to your catalogs. XLIFF is the editable exchange format. Its placeholders
					identify values and inline content the translation needs to retain.
				</p>
				<CodeBlock source={intlXliffSource} language="xml" title="Example XLIFF 2.1 source entry" />
				<p>
					When messages change, regenerate the source file. Catalog synchronization keeps compatible
					translations and notes, removes obsolete messages, and checks required placeholders.
					Regional locales can fall back through matching script and language catalogs.
				</p>
				<p>
					Translations can reorder declared values and inline elements, but cannot introduce
					executable code, arbitrary HTML, handlers, URLs, or undeclared values. Missing
					translations use the original message. The{' '}
					<a href="https://github.com/techjoshua/exact/blob/main/docs/internationalization.md">
						internationalization reference
					</a>{' '}
					describes extraction, catalog synchronization, and the current placeholder format.
				</p>
			</section>
			<section>
				<h2>Change the language for a page or region</h2>
				<p>
					A language picker can change the locale for an entire page. A smaller scope is useful for
					content in another language or a translation preview. Apply <code>intl:locale</code> to
					the containing element. eXact updates the locale along with its HTML <code>lang</code> and
					<code>dir</code> attributes, including right-to-left direction.
				</p>
				<CodeBlock source={intlLocaleSource} language="tsx" title="LocalizedRoot.tsx" />
				<p>
					A valueless <code>intl:locale</code> inherits the nearest environment. An explicit locale
					selects a scope within that environment, or creates an environment if there is no
					provider. Use <code>defineIntlLocale()</code> to validate locale strings from routes,
					headers, or user input. Server requests can have separate locales and catalogs without
					sharing mutable translation state.
				</p>
				<details>
					<summary>Locale attributes on fragments</summary>
					<p>
						A fragment needs an element to carry <code>lang</code> and <code>dir</code>, so the
						locale enhancement creates a <code>span</code> by default. A constant
						<code>intl:intrinsicFragment</code> selects another tag. Message-only fragments stay
						transparent. Consecutive enhancements requesting the same tag share one host. Inside
						<code>title</code> and <code>textarea</code>, markup is literal text and does not add
						attributes to the enclosing element.
					</p>
				</details>
			</section>
			<section>
				<h2>Include links, components, and plural choices</h2>
				<p>
					Messages can include ordinary text, shared values, known branches, and directly nested
					HTML elements. A separately defined component manages its own messages. If a translator
					needs to move that component within the sentence, wrap it in a named
					<code>intl:fragment</code>. The translation can place that fragment exactly once without
					changing the component or its behavior.
				</p>
				<CodeBlock source={intlStructureSource} language="tsx" title="Transfer.tsx" />
				<p>
					Keep plural choices and formatted values inside the sentence they belong to. Nested
					<code>intl:plural</code>, <code>intl:select</code>, and formatting attributes belong to
					the nearest <code>intl:message</code>, so the translator receives one message whose parts
					can be reordered. Used on their own, those attributes create their own message.
				</p>
				<CodeBlock source={intlCompositionSource} language="tsx" title="Delivery.tsx" />
				<p>
					If analysis is disabled or a region cannot be analyzed, its original content remains the
					fallback. Editor and build diagnostics help identify unsupported message shapes.
				</p>
				<details>
					<summary>Plural and ordinal rules beyond one or many</summary>
					<p>
						Some languages need more than singular and plural forms. Use a static
						<code>Intl.PluralRules</code> category map to express your source language’s choices. An
						ordinal describes a position, such as first or second. Specify
						<code>type: 'ordinal'</code> for those rules. The translated message uses the target
						locale’s rules.
					</p>
					<CodeBlock source={intlCardinalSource} language="tsx" title="Polish source: Inbox.tsx" />
					<CodeBlock
						source={intlOrdinalSource}
						language="tsx"
						title="English source: Placement.tsx"
					/>
					<p>
						<code>selectRange(start, end)</code> chooses one category for the range in the active
						locale. It requires native browser support. Source formatter locales must agree with the
						package’s source locale. A language-only tag may omit the region, but a conflicting
						language or region produces a diagnostic.
					</p>
				</details>
			</section>
			<section>
				<h2>Format prices, dates, and other values</h2>
				<p>
					A translated receipt also needs local date order, number separators, and list punctuation.
					Messages can contain standard <code>Intl</code> expressions. eXact recognizes their
					formatting intent and applies the active locale. A currency enhancement can infer currency
					and display style from the source text and source locale, such as a dollar sign in an
					<code>en-US</code> package.
				</p>
				<CodeBlock source={intlFormattersSource} language="tsx" title="Receipt.tsx" />
				<details>
					<summary>Reuse formatters inside and outside components</summary>
					<p>
						Native <code>Intl</code> formatters are cached automatically. They can live at module
						scope or in imported helpers and support both client and server execution. Components
						use their active locale. Ordinary helpers can use the public <code>intl</code> facade
						with an explicit locale. A server task also uses its component’s locale. Each call
						captures the current locale settings, so changing the provider affects subsequent calls.
					</p>
					<CodeBlock source={intlCacheSource} language="tsx" title="Formatting.tsx" />
				</details>
				<details>
					<summary>Display a relative age from a duration</summary>
					<p>
						A timestamp may read “just now,” then “two minutes ago.” The following helper chooses a
						unit from a <code>Temporal.Duration</code>. The surrounding message localizes the
						result. For a display that also updates as time passes, see{' '}
						<a href="#/components/date-time">date and time updates</a>.
					</p>
					<CodeBlock source={intlDurationSource} language="tsx" title="Published.tsx" />
				</details>
			</section>
			<section>
				<h2>Present measurements in appropriate units</h2>
				<p>
					A road distance and a person’s height are both lengths, but readers expect different units
					for them. Tell eXact what a measurement represents, and it can choose units for the locale
					and convert the value. When your application needs a fixed destination unit, you can set
					<code>intl:convert-to</code> to keep that unit across locales.
				</p>
				<CodeBlock source={intlUnitsSource} language="tsx" title="Measurements.tsx" />
				<p>
					For example, whole-number <code>12-18 miles</code> becomes <code>19-29 kilometers</code>,
					and <code>72 °F</code> becomes <code>22 °C</code>. Conversion preserves the source’s
					evaluated precision unless you set explicit digit options. Rounding happens after
					conversion.
				</p>
				<p>
					A formatter can apply directly to a semantic element when it owns all of that element’s
					content. A <code>_</code> fragment lets you format a smaller inline range or several
					separate regions within one element.
				</p>
				<details>
					<summary>Unit selection, overrides, and precision</summary>
					<p>
						Automatic selection uses Unicode CLDR 48 preferences for the quantity, usage, locale
						region, measurement-system overrides, and magnitude. It can produce mixed units such as
						feet and inches. Application or user overrides take priority. An explicit
						<code>intl:convert-to</code> stays fixed. A range uses its largest absolute endpoint to
						choose one unit for both values.
					</p>
					<p>
						Supported quantities include area, mass, volume, speed, pressure, energy, power, fuel
						economy, digital storage, and temperature. Conversion checks compatible dimensions and
						supports offset and reciprocal formulas. Small nonzero results retain enough fraction
						digits to avoid displaying zero. Labels are case-sensitive: <code>Mb</code> and
						<code>MB</code> mean different things.
					</p>
					<p>
						Where native <code>Intl.NumberFormat</code> lacks a unit such as <code>kPa</code>,
						<code>kWh</code>, or <code>hp</code>, eXact uses its standardized symbol while retaining
						native number formatting, spacing, placement, and text direction.
					</p>
				</details>
				<details>
					<summary>Use localized values in a component library</summary>
					<p>
						Library authors can use the public measurement presentation operations and cached
						formatters. <code>IntlScalarPresentationContext</code> exposes a prepared scalar
						message’s translated text, source fallback, locale, and direction. Messages containing
						elements remain rendered content. See the
						<a href="https://github.com/techjoshua/exact/blob/main/docs/internationalization.md">
							internationalization reference
						</a>{' '}
						for these integration APIs and source-analysis rules.
					</p>
				</details>
			</section>
			<section>
				<h2>Translate placeholders and accessible labels</h2>
				<p>
					Text in attributes needs translation too. Mark <code>placeholder</code>, <code>alt</code>,
					<code>title</code>, or supported ARIA text with its corresponding <code>intl:*</code>
					attribute. eXact translates that value while preserving the element and its behavior.
				</p>
				<CodeBlock source={intlPropertiesSource} language="tsx" title="Search.tsx" />
				<p>
					The authored value remains the fallback. Within a named content message, property keys get
					a readable prefix such as <code>account_placeholder</code>. Each property has its own text
					and placeholder contract. An explicit property-level name overrides the prefix.
				</p>
				<p>
					Formatting can apply to attributes too. Here,
					<code>intl:aria-label="display-name:languageCode"</code> turns a language code into its
					localized name. That name comes from locale data and needs no catalog translation.
				</p>
			</section>
			<section>
				<h2>Find missing translations before shipping</h2>
				<p>
					It is easy to translate the main page and overlook a placeholder or an error message. The
					language integration reports likely untranslated text and missing required locales in the
					editor and build. Hover an <code>intl:*</code> attribute to see the message identifier,
					source language, formatting choices, and matching catalogs.
				</p>
				<CodeBlock source={intlLanguageToolsSource} language="ts" title="exact.config.ts" />
				<p>
					The package-scoped export enables <code>intl:*</code> without a per-component import and
					lets the provider inspect compiled components for missed text. Invalid message shapes are
					errors. Required locales can produce missing-translation warnings. These checks run in
					development and add no analyzer or catalog-reading code to the browser.
				</p>
				<p>
					For text you intentionally leave untranslated, the inherited HTML
					<code>translate="no"</code> attribute excludes it from translation checks.{' '}
					<code>lang</code> and <code>dir</code> describe the content but do not exclude it from
					translation checks.
				</p>
			</section>
			<section>
				<h2>Try the translation example</h2>
				<p>
					The <a href="./intl/">Intl Testbed</a> displays English, French, Japanese, and Arabic from
					the same values. Change the controls to compare plural forms, dates, units, and reordered
					message fragments. Its source is in <code>apps/intl-testbed</code>. Run
					<code>npm run dev:intl</code> from the repository.
				</p>
			</section>
		</Article>
	);
}

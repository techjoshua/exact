import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';
import { ThemeProposalCompletionSections } from './ThemeProposalCompletionSections.jsx';
import { ThemeVocabularySection } from './ThemeVocabularySection.jsx';

const themeSource = `<_ theme:scope
	theme:tonic="violet"
  theme:temperament="expressive"
  theme:appearance="system"
  theme:density="comfortable"
  theme:shape="soft"
  theme:depth="bordered"
  theme:element="main"
>
  <Application />
</_>`;

const providerSource = `export default defineConfig({
  plugins: {
    theme: tailwindThematicProvider({
      mode: 'hybrid',
      stylesheet: './src/app.css'
    })
  }
});`;

/** Documents the semantic and generative @exactjs/theme contract. */
export function ThemeProposalPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component library / @exactjs/theme"
			title="Theme with semantic roles"
			description="A compact theme source resolves into a live semantic CSS contract, while attributed enhancements let portable components state what each element means."
			previous={{ path: '/components/enhancements', label: 'Enhancements' }}
			next={{ path: '/components/date-time', label: 'Date & time' }}
		>
			<Callout title="Implemented as exact-theme/1">
				The package, reactive scopes, CSS variables, enhancements, override validation, and exterior
				derivation APIs are available now.{' '}
				<a href="./enhancements/#theme-lab">Open the Theme Lab</a> to change root and nested sources
				live. This documentation shell also uses a reactive root theme scope for its persisted
				appearance and customization preferences, including browser-owned chrome such as scrollbars.
				Its cards, dialogs, navigation, demos, callouts, and code blocks use semantic theme
				enhancements, so depth and the other source axes remain visible throughout the app. Code
				blocks derive a local vivid, contrast-safe palette that follows the selected appearance by
				default without breaking monochrome temperament.
			</Callout>

			<section>
				<h2>One appearance preference across repository applications</h2>
				<p>
					The docs and hosted samples share a compact sun/moon toggle and one origin-wide stored
					appearance. Choosing the appearance already preferred by the operating system removes the
					override and resumes system tracking; the docs customization selector uses that same
					state.
				</p>
			</section>
			<section>
				<h2>A small source, a complete live theme</h2>
				<p>
					The key color acts as a visual tonic. Temperament supplies a coherent interval system for
					color, surfaces, interaction states, typography, spacing, controls, shape, depth, and
					motion. Appearance, density, shape, depth, typography, contrast, and motion remain
					independent base choices; temperament changes their internal rhythm rather than selecting
					them.
				</p>
				<p>
					The built-in tonic names are convenient presets, not a closed palette. A scope may instead
					provide any opaque CSS Color 4 or Design Tokens color. The Theme Lab exposes native color
					pickers for reactive root and nested custom tonics.
				</p>
				<CodeBlock source={themeSource} language="tsx" title="Application theme scope" />
				<p>
					Built-in temperaments are <code>balanced</code>, <code>restrained</code>,
					<code>expressive</code>, <code>dramatic</code>, <code>soft</code>, <code>stark</code>, and
					<code>monochrome</code>. Resolution happens in OKLCH and validates gamut, text contrast,
					boundaries, focus indicators, and interaction states before publication.
				</p>
				<p>
					The names are perceptually and structurally distinct rather than forming a saturation
					scale. Restrained compresses most intervals; expressive broadens color, type, space, and
					state rhythm; dramatic and stark establish progressively stronger hierarchy; soft combines
					gentle steps with generous line height; and monochrome removes chroma without flattening
					structure. Light and dark preserve the same ordered relationships.
				</p>
				<p>
					Nested scopes may omit any source axis or select <code>inherit</code> explicitly,
					including for the tonic and temperament fields.
				</p>
				<p>
					Each scope establishes its generated body font, base size, and line height for native
					descendants. Heading, display, and code roles then select their dedicated typography
					tokens.
				</p>
				<p>
					The contract pins its context-free CSS color grammar, 24-step chroma gamut mapping,
					nearest-first search over a 1,001-value contrast grid, surface and tone formulas,
					canonical rounding, serialization, fingerprinting, and every built-in typography stack.
					Independent implementations therefore have golden outputs rather than aesthetic
					discretion.
				</p>
			</section>

			<section>
				<h2>Static recipes consume reactive variables</h2>
				<p>
					The package loads role CSS once. Each <code>Theme</code> scope publishes the complete
					<code>exact-theme/1</code> custom-property map. Components reference those live values;
					they do not copy resolved colors. A user theme change replaces one scope map, and the CSS
					cascade updates every descendant without remounting or a callback per element.
				</p>
				<p>
					Nested themes inherit omitted source fields and re-resolve when an inherited parent field
					changes. Nested surfaces are cheaper and separate: they select complete surface bundles
					for foreground, background, muted text, borders, and shadow within the same theme.
				</p>
				<p>
					Visible surfaces include safe default padding. The pill shape remains fully rounded for
					controls, while content-bearing surfaces use a bounded <code>1.5rem</code> radius so their
					children stay inside the curved edges. Transparent surfaces add neither decoration nor
					padding.
				</p>
				<p>
					V1 always renders an owned semantic wrapper and publishes one lexically ordered theme
					style attribute in a single mutation. It does not merge arbitrary authored styles,
					generate hashed classes, or claim support for CSP configurations that prohibit style
					attributes.
				</p>
			</section>

			<ThemeVocabularySection />

			<section>
				<h2>The CSS ABI is explicit</h2>
				<p>
					The reserved <code>--exact-theme-</code> prefix contains complete surface bundles; six
					tone families for neutral, accent, info, success, warning, and danger; and documented
					typography, spacing, control, radius, border, shadow, duration, and easing scales.
					Recipe-private aliases use <code>--_exact-theme-</code> and are not public API.
				</p>
				<p>
					The normative proposal lists every variable and the exact static rules for theme scopes,
					surface aliasing, actions, fields, text, statuses, separators, selections, forced colors,
					and reduced motion. A default root declaration is generated from the same golden resolver
					fixture used by SSR rather than maintained as a second palette.
				</p>
			</section>

			<section>
				<h2>External thematic providers are proposed</h2>
				<p>
					A future provider boundary can translate the same semantic requests into Tailwind,
					Bootstrap, or organization-owned class names and typed style values. Component libraries
					would continue to publish meaning such as <code>theme:action=&quot;primary&quot;</code>;
					the consuming application would select the presentation system because it owns the CSS
					build.
				</p>
				<CodeBlock source={providerSource} language="ts" title="Proposed exact.config.ts" />
				<p>
					The proposal separates a runtime-safe semantic presenter from a finite build manifest.
					Tailwind can therefore discover complete candidate strings before compilation, while
					Bootstrap can use its classes, color-mode attributes, variables, and optional Sass utility
					build. Dynamic class fragments are not part of the contract.
				</p>
				<p>
					The recommended Tailwind mode is hybrid: external utilities point to stable
					<code>exact-theme/1</code> variables, preserving arbitrary tonic colors, contrast
					validation, nested inheritance, and live scope changes. Strict native-palette modes may
					instead expose a finite external palette, but must diagnose unsupported theme inputs
					rather than silently approximate them.
				</p>
				<p>
					This is a design proposal, not implemented API. The baseline recipes must first move
					behind the provider contract with equivalent SSR, hydration, computed styles, and
					performance; Tailwind and Bootstrap then serve as two independent conformance adapters.
				</p>
			</section>

			<ThemeProposalCompletionSections />
		</Article>
	);
}

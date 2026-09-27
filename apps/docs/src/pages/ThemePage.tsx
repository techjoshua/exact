import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
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

const chartSource = `function SalesChart(this: Component<{}>, props: ChartProps) {
  const theme = this.getContext(ThemeContext);
  const surface = this.getContext(ThemeSurfaceContext);

  const colors = () => deriveDataColors(theme.current, {
    kind: 'categorical',
    count: props.series.length,
    surface: surface.bundle
  });

  return () => <Chart series={props.series} colors={colors().colors} />;
}`;

/** Documents the semantic and generative @exactjs/theme contract. */
export function ThemePage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component library / @exactjs/theme"
			title="Theme with semantic roles"
			description="Choose colors, typography, spacing, and light or dark appearance for an application or part of a page."
			previous={{ path: '/components/enhancements', label: 'Enhancements' }}
			next={{ path: '/components/charts', label: 'Charts' }}
		>
			<section>
				<h2>Apply a theme scope</h2>
				<p>
					Changing a brand color or adding dark mode affects text, surfaces, borders, and
					interaction states together. <code>theme:scope</code> derives coordinated theme values
					from a few settings and applies them to its contents. Start with a key color (
					<code>tonic</code>), an overall style (<code>temperament</code>), and a light, dark, or
					system appearance. Density controls spacing. Shape and depth control edges and surfaces.
					The example wraps the application in a scope rendered as a <code>main</code> element.
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
					scale. Restrained compresses most intervals. Expressive broadens color, type, space, and
					state rhythm. Dramatic and stark establish progressively stronger hierarchy. Soft combines
					gentle steps with generous line height. Monochrome removes chroma without flattening
					structure. Light and dark preserve the same ordered relationships.
				</p>
				<p>
					Nested scopes may omit any source axis or select <code>inherit</code> explicitly,
					including tonic, temperament, and the background painting policy. Partial typography
					objects inherit each omitted field. Wrapper element names are structural choices and
					independently default to a div.
				</p>
				<p>
					A nested <code>theme:scope</code> can override the theme for part of a page. It derives a
					theme from inherited settings and keeps CSS variables and <code>ThemeContext</code>{' '}
					consistent. For a CSS-only token patch, <code>createThemeOverride()</code> returns a
					validated style string for an ordinary wrapper. That helper does not change the theme
					context, and a nested scope publishes its own generated token values.
				</p>
				<p>
					Typography accepts presets or partial objects such as
					<code>theme:typography={`{{ body: '"Example Sans", sans-serif' }}`}</code>. Omitted fields
					inherit, including font sizes and line heights. Load font assets with application CSS.
					Scopes also accept custom temperament objects and
					<code>theme:neutralColor</code> / <code>theme:canvasColor</code> sources.
				</p>
				<p>
					Each scope establishes its generated body font, base size, and line height for native
					descendants. Heading, display, and code roles then select their dedicated typography
					tokens.
				</p>
				<p>
					For the color-resolution formulas, serialization rules, and exact CSS variable
					definitions, see the{' '}
					<a href="https://github.com/techjoshua/exact/blob/main/docs/theme.md">theme reference</a>.
				</p>
			</section>

			<section>
				<h2>Use theme colors and spacing</h2>
				<p>
					The package loads role CSS once. Each <code>Theme</code> scope publishes the complete
					<code>exact-theme/1</code> custom-property map. Components reference those live values.
					They do not copy resolved colors. A user theme change replaces one scope map, and the CSS
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
					attributes or generated style elements.
				</p>
			</section>

			<section>
				<h2>System preferences and server rendering</h2>
				<p>
					Use <code>theme:appearance="inverse-system"</code> to oppose the browser preference, or{' '}
					<code>theme:appearance="inverse"</code> to oppose the parent’s effective appearance.
					Omitted settings inherit, including individual fields in partial typography objects. An
					inherited inverse result is not inverted again.
				</p>
				<p>
					Read <code>ThemeContext.appearance</code> for the effective light or dark value. It is
					undefined during SSR when browser preferences are needed.
					<code>ThemeContext.preferences.appearance</code> retains the requested choice. The
					corresponding CSS targets are <code>data-exact-theme-resolved-appearance</code>
					and <code>data-exact-theme-appearance</code>. The resolved attribute is absent while
					unknown. Change reactive scope inputs to select appearance. Editing output attributes does
					not update the theme context. Generated CSS also aligns native controls with the selected
					appearance, including inverse modes before activation.
				</p>
				<p>
					System appearance, contrast, and motion remain unresolved on the server. Generated media
					queries select browser preferences on first paint and track changes even without
					JavaScript. Explicit values take precedence, and nested scopes inherit requested
					preferences.
				</p>
				<p>
					<code>ThemeContext.preferences</code> retains system choices.{' '}
					<code>ThemeContext.system</code>
					is undefined until browser activation, then exposes live preferences. Before activation,
					resolved context values use a light, standard-contrast, full-motion reference. Components
					deriving non-CSS output should wait for known preferences or receive an explicit initial
					value.
				</p>
				<p>
					To restore a saved choice, validate it in your application and supply the same explicit
					root preference to server rendering and hydration. A missing or invalid choice can fall
					back to system mode or another application default. Your application owns cookie storage
					and request-specific HTML caching.
				</p>
			</section>

			<ThemeVocabularySection />

			<section>
				<h2>Use theme CSS variables</h2>
				<p>
					The reserved <code>--exact-theme-</code> prefix contains complete surface bundles, six
					tone families for neutral, accent, info, success, warning, and danger, and documented
					typography, spacing, control, radius, border, shadow, duration, and easing scales.
					Recipe-private aliases use <code>--_exact-theme-</code> and are not public API.
				</p>
				<p>
					The theme contract defines every variable and the static rules for theme scopes, surface
					aliasing, actions, fields, text, statuses, separators, selections, forced colors, and
					reduced motion. A default root declaration is generated from the same golden resolver
					fixture used by SSR rather than maintained as a second palette.
				</p>
			</section>

			<section>
				<h2>Choose colors for charts and custom graphics</h2>
				<p>
					Charts, editors, maps, diagrams, and other domain components receive a pure immutable
					derivation context containing the key color, tone families, surfaces, gamut conversion,
					harmonization, and contrast operations. Derivers are synchronous, versioned,
					deterministic, SSR-safe, and imported normally rather than globally registered.
				</p>
				<CodeBlock source={chartSource} language="tsx" title="Reactive chart colors" />
				<p>
					The built-in data-color deriver supports categorical sets of one through twelve,
					sequential sets of two through twelve, and odd diverging sets of three through eleven. It
					returns foregrounds, strokes, patterns, and warnings as well as colors. Categorical
					palettes reserve the semantic accent and its immediate perceptual neighborhood for
					interaction and emphasis. Components must still use labels, symbols, patterns, or another
					non-color encoding when color identity is necessary to understand the content.
				</p>
			</section>

			<section>
				<h2>Explore the Theme Lab</h2>
				<p>
					The <a href="./enhancements/#theme-lab">Theme Lab</a> lets you vary root and nested themes
					across reusable controls, surfaces, and an accessible chart. Use it to inspect
					inheritance, contrast, interaction depth, and derived colors together.
				</p>
				<p>
					Automated browser coverage currently targets Chromium. Cross-engine, forced-colors, zoom,
					text-spacing, SSR, and hydration coverage is incomplete. The Chromium checks do not
					establish cross-engine certification.
				</p>
			</section>
		</Article>
	);
}

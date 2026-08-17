import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';

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

/** Documents theme derivation and the package's rendered-browser acceptance contract. */
export function ThemeProposalCompletionSections(this: Component<{}>) {
	return () => (
		<>
			<section>
				<h2>Specialized components derive; they do not scrape CSS</h2>
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
					returns foregrounds, strokes, patterns, and warnings as well as colors. Components must
					still use labels, symbols, patterns, or another non-color encoding when color identity is
					necessary to understand the content.
				</p>
			</section>

			<section>
				<h2>Acceptance is exercised by a complete interactive Theme Lab</h2>
				<p>
					The package cannot graduate from resolver fixtures or a swatch page. A production-built
					sample must provide live root controls for key color, temperament, appearance, contrast,
					density, shape, depth, typography, and motion. It must place the same reusable control,
					text, surface, selection, validation, and status specimen inside both the root theme and
					an independently configurable nested theme. On wide screens, the root controls remain
					visible beside the scrolling results, and a compact base, raised, floating, and sunken
					surface comparison makes depth changes directly observable.
				</p>
				<p>
					Each specimen also contains an accessible translucent area chart with at least three
					overlapping series. The chart derives fills, opaque strokes, labels, grid, focus, legend,
					and tooltip colors from the active theme and surface, while patterns, symbols, direct
					labels, and a textual data view ensure color is not the only distinction.
				</p>
				<p>
					Distinct action and selection groups use the public density-aware control gap with a
					<code>0.25rem</code> minimum, keeping adjacent rounded controls visibly separate at every
					density.
				</p>
				<p>
					A live textual depth readout follows the specimen's pointer, keyboard, and drag events,
					naming the active state and effective shadow token so the interaction model is directly
					verifiable in every depth mode.
				</p>
				<p>
					The current rendered-browser gate starts with Chromium. It checks reactive root and nested
					inheritance, stable DOM identity and native state, every temperament in light and dark,
					computed contrast and typography, tonic-colored native controls, representative pixels,
					interaction depth, accessibility output, and browser errors. Firefox, WebKit, forced
					colors, zoom, text-spacing, SSR, and hydration remain explicit additions to the complete
					acceptance matrix; the Chromium result must not be presented as cross-engine
					certification.
				</p>
				<p>
					The reusable specimen and a compound control must come from separately compiled packaged
					output with no access to Theme Lab source or CSS. That package-boundary build proves the
					vocabulary works for exterior component libraries rather than only inside the docs app.
				</p>
			</section>
		</>
	);
}

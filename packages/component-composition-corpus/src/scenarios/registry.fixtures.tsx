import { createComponentRegistry } from '@exactjs/core';

// The registry intentionally appears before its component declarations. Artifact attachment must
// be hoisted ahead of this executable reference without changing ordinary function hoisting.
const CorpusViews = createComponentRegistry(() => ({ first: FirstView, second: SecondView }));
const LazyViews = createComponentRegistry(({ lazy }) => ({
	second: lazy(() =>
		import('./registry-lazy.fixtures.js').then(({ LazySecondView }) => LazySecondView)
	)
}));

function FirstView() {
	return () => <p data-view="first">first</p>;
}

function SecondView() {
	return () => <p data-view="second">second</p>;
}

function RegistryRoot(props: { selection: 'first' | 'second' }) {
	const Current = CorpusViews[props.selection];
	return () => (
		<section data-scenario="registry">
			<Current />
		</section>
	);
}

/** Creates an eager finite-registry root. */
export const registryRoot = (selection: 'first' | 'second' = 'first') => (
	<RegistryRoot selection={selection} />
);

/** Compiler-issued finite lazy-registry root. */
export const lazyRegistryRoot = <LazyViews.second />;

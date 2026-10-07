import { createComponentRegistry, type KeyOf } from '@exactjs/core';

// The registry intentionally appears before its component declarations. Artifact attachment must
// be hoisted ahead of this executable reference without changing ordinary function hoisting.
const CorpusViews = createComponentRegistry(() => ({ first: FirstView, second: SecondView }))!;
const SelectedViews = CorpusViews;
const LazyViews = createComponentRegistry(({ lazy: load }) => ({
	second: load(() =>
		import('./registry-lazy.fixtures.js').then(({ LazySecondView }) => LazySecondView)
	)
}));
const EscapedViews = createComponentRegistry(function ({ lazy: load }) {
	return {
		'quote"key': FirstView,
		'slash\\key': load(() =>
			import(`./registry-lazy.fixtures.js`).then((module) => module[`LazySecondView`])
		)
	};
});

function FirstView() {
	return () => <p data-view="first">first</p>;
}

function SecondView() {
	return () => <p data-view="second">second</p>;
}

function RegistryRoot(props: { selection: 'first' | 'second' }) {
	const Current = SelectedViews[props.selection] satisfies typeof FirstView;
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

function EscapedRegistryRoot(props: { selection: KeyOf<typeof EscapedViews> }) {
	const Current = EscapedViews[props.selection];
	return () => <Current />;
}

/** Creates a registry root whose literal keys and deferred import retain exact source values. */
export const escapedRegistryRoot = (selection: KeyOf<typeof EscapedViews> = 'quote"key') => (
	<EscapedRegistryRoot selection={selection} />
);

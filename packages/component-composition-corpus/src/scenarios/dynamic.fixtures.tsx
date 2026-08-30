import type { ComponentFunction } from '@exactjs/core';

function DynamicFirst() {
	return () => <p data-dynamic="first">first</p>;
}

function DynamicOwner(props: { Current: ComponentFunction<{}> }) {
	/** @exact dynamic */
	const Current = props.Current;
	return () => (
		<section data-scenario="dynamic">
			<Current />
		</section>
	);
}

/** Creates an open dynamic-component root from a compiler-issued component value. */
export const dynamicRoot = (Current: ComponentFunction<{}> = DynamicFirst) => (
	<DynamicOwner Current={Current} />
);

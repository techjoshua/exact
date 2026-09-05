import type { Component } from '@exactjs/core';

function InspectionPage(this: Component<{}>) {
	return () => <main>Ready</main>;
}

/** Compiler-issued root used by target-paired inspection tests. */
export const inspectionPageRoot = <InspectionPage />;

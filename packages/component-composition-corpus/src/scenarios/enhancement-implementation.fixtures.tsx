import type { Child, Component } from '@exactjs/core';

const observedTones: Array<string | undefined> = [];

/** Test enhancement that contributes a data attribute to its selected target. */
export function corpus(this: Component<{}>, props: { children?: Child; tone?: string }) {
	observedTones.push(props.tone);
	return () => <_target data-corpus-tone={props.tone}>{props.children}</_target>;
}

/** Reads enhancement constructions for behavioral acceptance tests. */
export function enhancementTones(): readonly (string | undefined)[] {
	return observedTones;
}

/** Resets enhancement construction observations. */
export function resetEnhancementTones(): void {
	observedTones.length = 0;
}

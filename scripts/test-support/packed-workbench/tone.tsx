import type { Child, Component } from '@exactjs/core';

/** Supplies a visible, deterministic enhancement contribution from an optional package. */
export function tone(this: Component<{}>, props: { children?: Child; value?: string }) {
	return () => <_target data-package-tone={props.value} />;
}

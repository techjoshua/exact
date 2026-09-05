import type { Child, Component } from '@exactjs/core';

/** Compiler-produced enhancement used by the catalog-aware SSR facade test. */
export function FacadeEnhancement(this: Component<{}>, props: { children?: Child | Child[] }) {
	return () => <aside>{props.children}</aside>;
}

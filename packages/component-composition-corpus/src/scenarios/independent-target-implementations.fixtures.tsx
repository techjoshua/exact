import type { Child } from '@exactjs/core';

/** Structural peer that makes its selected range observable across renderers. */
export function LeftShell(props: { children?: Child; active?: boolean }) {
	return () => <aside data-enhancement="left">{props.children}</aside>;
}

/** Independent structural peer with a different namespace destination. */
export function RightShell(props: { children?: Child; active?: boolean }) {
	return () => <div data-enhancement="right">{props.children}</div>;
}

import type { Child, Component, RootLifecycle } from '@exactjs/core';

/** Compiler-backed transparent enhancement used by target-routing tests. */
export function motion(
	this: Component<{}>,
	props: {
		children?: Child;
		tone?: string;
		onRoot?(root: RootLifecycle<HTMLElement>): void;
		onUnmount?(): void;
	}
) {
	props.onRoot?.(this.refs.root<HTMLElement>());
	if (props.onUnmount) this.onUnmount(props.onUnmount);
	return () => props.children;
}

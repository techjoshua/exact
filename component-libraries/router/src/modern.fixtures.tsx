import type { Component } from '@exactjs/core';
import { RouterControllerContext } from './context.js';

/** Exposes native router context through an explicitly compiled compatibility fixture. */
export function NativeLocation(this: Component<{ version: number }>) {
	this.state.version = 0;
	const router = this.getContext(RouterControllerContext);
	let unsubscribe: (() => void) | undefined;
	this.onMount(() => {
		unsubscribe = router.subscribe(() => {
			this.state.version++;
		});
	});
	this.onUnmount(() => unsubscribe?.());
	return () => nativeLocationPath(router, this.state.version);
}

/** Reads the current location while retaining the fixture's reactive version dependency. @exact pure */
function nativeLocationPath(
	router: { getSnapshot(): { location: { pathname: string } } },
	_version: number
): string {
	void _version;
	return router.getSnapshot().location.pathname;
}

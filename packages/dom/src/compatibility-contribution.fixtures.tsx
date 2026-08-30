import type { Component } from '@exactjs/core';

let disposals = 0;

/** Compiler-backed native component placed through the React compatibility range API. */
export function CompatibilityNative(this: Component<Record<string, never>>) {
	this.onUnmount(() => disposals++);
	return () => <strong>component</strong>;
}

/** Resets compatibility-range lifecycle observations. */
export function resetCompatibilityNativeDisposals() {
	disposals = 0;
}

/** Reports compatibility-range native component disposal. */
export function compatibilityNativeDisposals() {
	return disposals;
}

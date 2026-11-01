import type { Component } from '@exactjs/core';
let releases = 0;
/** Stable failure identity retained by both root and nested construction controls. */
export const constructionError = new Error('owned construction failure');
/** Fails before a component instance can be returned to its renderer. */
export function ConstructionErrorRoot() {
	throw constructionError;
	return () => <p>unreachable</p>;
}
/** Owns a lifecycle resource before a different root replaces it. */
export function HealthyConstructionRoot(this: Component<{}>) {
	this.onUnmount(() => {
		releases++;
	});
	return () => <button>healthy</button>;
}
/** Counts completed ownership releases without resetting other mounted controls. */
export function constructionReleaseCount() {
	return releases;
}

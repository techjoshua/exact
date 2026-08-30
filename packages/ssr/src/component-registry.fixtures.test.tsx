import type { Component } from '@exactjs/core';

/** Eager compiled registry candidate. */
export function EagerRegistryComponent(
	this: Component<Record<string, never>>,
	props: { label: string }
) {
	return () => <p>eager:{props.label}</p>;
}

/** Lazy compiled registry candidate. */
export function LazyRegistryComponent(
	this: Component<Record<string, never>>,
	props: { label: string }
) {
	return () => <p>lazy:{props.label}</p>;
}

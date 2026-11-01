import { createRef, type Component } from '@exactjs/core';
import { currentEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { render, type RenderOptions } from '@exactjs/dom/root';

/** Mounts a compiler-closed static program through the public root entry. */
export function mountStaticWork(container: Element, options: RenderOptions) {
	render(
		<main>
			<section>
				<span>text</span>
			</section>
		</main>,
		container,
		options
	);
}

/** Keeps each nested template on the native intrinsic operation path. */
export function mountIntrinsicWork(container: Element, options: RenderOptions) {
	render(
		<template>
			<template>
				<template>text</template>
			</template>
		</template>,
		container,
		options
	);
}

function ScalarWork(this: Component<{}>) {
	return () => 'text';
}

/** Mounts an already-accounted component and scalar child as a double-charge control. */
export function mountScalarWork(container: Element, options: RenderOptions) {
	render(<ScalarWork />, container, options);
}

/** Observes component ownership around an intrinsic subtree limit failure. */
export let workOwner: Component<{}> | undefined;
/** Ref held only while the bounded tree is successfully mounted. */
export const workRef = createRef<HTMLTemplateElement>('mount-work');

/** Records disposal of successfully mounted components. */
export const workReleases: string[] = [];
/** Attributes disposal to the exact mounted component rather than a preparation attempt. */
export const workReleasedOwners: Component<{}>[] = [];

/** Captures the component scope to observe aborted mount cleanup. */
export let workScope: EffectScope | undefined;

/** Shared intrinsic subtree used by mount and hydration journeys. */
export function OwnedWork(this: Component<{}>) {
	workOwner = this;
	workScope = currentEffectScope();
	this.onUnmount(() => {
		workReleases.push('released');
		workReleasedOwners.push(this);
	});
	return () => (
		<template ref={this.ref(workRef)}>
			<template>
				<template>text</template>
			</template>
		</template>
	);
}

/** Mounts an intrinsic tree under a component-owned scope and ref. */
export function mountOwnedWork(container: Element, options: RenderOptions) {
	render(<OwnedWork />, container, options);
}

/** Exercises native template content updates without replacing the template host. */
export function mountTemplateText(container: Element, value: string, options: RenderOptions) {
	render(<template>{value}</template>, container, options);
}

/** Keeps a foreign-namespace template on ordinary element child semantics. */
export function mountForeignTemplateText(
	container: Element,
	value: string,
	options: RenderOptions
) {
	render(
		<svg>
			<template>{value}</template>
		</svg>,
		container,
		options
	);
}

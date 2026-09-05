import type { Component, RootLifecycle } from '@exactjs/core';
import { runTaskFrame } from '@exactjs/core/framework/task-frames';
import { watch } from '@exactjs/reactive';

let removalOwner: Component<{ show: boolean }> | undefined;
let removalRoot: RootLifecycle<Element> | undefined;
let resolveRemoval: (() => void) | undefined;
let removalSettlement: Promise<void> = Promise.resolve();

let replacementOwner: Component<{ replace: boolean }> | undefined;
let replacementRoot: RootLifecycle<Element> | undefined;
let resolveReplacement: (() => void) | undefined;
let replacementSettlement: Promise<void> = Promise.resolve();

let reversibleOwner: Component<{ show: boolean }> | undefined;
let reversibleRoot: RootLifecycle<Element> | undefined;
export let reversibleActivations = 0;
export let reversibleDeactivations = 0;

/** Resets the controlled retained-removal settlement. */
export function resetRemovalRetentionFixture() {
	removalSettlement = new Promise<void>((resolve) => {
		resolveRemoval = resolve;
	});
}

/** Settles retained removal work. */
export function finishRemovalRetention() {
	resolveRemoval?.();
}

function RemovalRetentionChild(this: Component<{}>) {
	removalRoot = this.refs.root();
	watch(() => {
		if (!removalRoot?.release) return;
		void runTaskFrame(
			{ kind: 'test-release', readiness: 'nonblocking' },
			{ work: () => removalSettlement }
		).catch(() => undefined);
	});
	return () => <button>Retained</button>;
}

/** Compiler-backed retained component removal fixture. */
export function RemovalRetentionOwner(this: Component<{ show: boolean }>) {
	removalOwner = this;
	this.state.show = true;
	return () => (this.state.show ? <RemovalRetentionChild /> : null);
}

/** Reads the retained-removal owner. */
export function removalRetentionOwnerInstance() {
	if (!removalOwner) throw new Error('RemovalRetentionOwner is not mounted');
	return removalOwner;
}

/** Reads the retained-removal child root. */
export function removalRetentionRoot() {
	if (!removalRoot) throw new Error('RemovalRetentionChild root is unavailable');
	return removalRoot;
}

/** Resets the controlled type-replacement settlement. */
export function resetReplacementRetentionFixture() {
	replacementSettlement = new Promise<void>((resolve) => {
		resolveReplacement = resolve;
	});
}

/** Settles retained type-replacement work. */
export function finishReplacementRetention() {
	resolveReplacement?.();
}

function ReplacementRetentionChild(this: Component<{}>) {
	replacementRoot = this.refs.root();
	watch(() => {
		if (!replacementRoot?.release) return;
		void runTaskFrame(
			{ kind: 'test-replacement-release', readiness: 'nonblocking' },
			{ work: () => replacementSettlement }
		).catch(() => undefined);
	});
	return () => <button>Retained</button>;
}

/** Compiler-backed retained type-replacement fixture. */
export function ReplacementRetentionOwner(this: Component<{ replace: boolean }>) {
	replacementOwner = this;
	this.state.replace = false;
	return () => (this.state.replace ? <span>Replacement</span> : <ReplacementRetentionChild />);
}

/** Reads the retained type-replacement owner. */
export function replacementRetentionOwnerInstance() {
	if (!replacementOwner) throw new Error('ReplacementRetentionOwner is not mounted');
	return replacementOwner;
}

/** Reads the retained type-replacement child root. */
export function replacementRetentionRoot() {
	if (!replacementRoot) throw new Error('ReplacementRetentionChild root is unavailable');
	return replacementRoot;
}

/** Resets reversible retained-root observations. */
export function resetReversibleRetentionFixture() {
	reversibleActivations = 0;
	reversibleDeactivations = 0;
}

function ReversibleRetentionChild(this: Component<{}>) {
	reversibleRoot = this.refs.root();
	this.onActivate(() => reversibleActivations++);
	this.onDeactivate(() => reversibleDeactivations++);
	watch(() => {
		if (!reversibleRoot?.release) return;
		void runTaskFrame(
			{ kind: 'test-release', readiness: 'nonblocking' },
			{ work: () => new Promise<void>(() => undefined) }
		).catch(() => undefined);
	});
	return () => <button>Reversible</button>;
}

/** Compiler-backed reversible retained-root fixture. */
export function ReversibleRetentionOwner(this: Component<{ show: boolean }>) {
	reversibleOwner = this;
	this.state.show = true;
	return () => (this.state.show ? <ReversibleRetentionChild /> : null);
}

/** Reads the reversible retention owner. */
export function reversibleRetentionOwnerInstance() {
	if (!reversibleOwner) throw new Error('ReversibleRetentionOwner is not mounted');
	return reversibleOwner;
}

/** Reads the reversible child root. */
export function reversibleRetentionRoot() {
	if (!reversibleRoot) throw new Error('ReversibleRetentionChild root is unavailable');
	return reversibleRoot;
}

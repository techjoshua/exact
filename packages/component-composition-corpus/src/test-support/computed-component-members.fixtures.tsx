import { createRef, type Component } from '@exactjs/core';

const trace: string[] = [];

/** Clears observations between independent component lifetimes. */
export function resetComputedMemberTrace() {
	trace.length = 0;
}

/** Returns a copy so assertions cannot change component-owned observations. */
export function computedMemberTrace() {
	return [...trace];
}

function ownershipKey(): 'own' {
	trace.push('key');
	return 'own';
}

function mountKey(): 'onMount' {
	trace.push('mount-key');
	return 'onMount';
}

class OwnedSession {
	constructor() {
		trace.push('created');
	}
	/** Records release so retained updates and repeated teardown can detect duplicate ownership. */
	dispose() {
		trace.push('disposed');
	}
}

/** Owns one resource across retained updates and registers lifecycle through finite keys. */
export function ComputedComponentMembers(this: Component<{ count: number }>) {
	this.state.count = 0;
	const unmount = 'onUnmount' as const;
	this[ownershipKey()](new OwnedSession());
	this[mountKey()](() => trace.push('mounted'));
	this[unmount](() => trace.push('unmounted'));
	return () => (
		<section>
			<output>{this.state.count}</output>
			<button onClick={() => this.state.count++}>Next</button>
		</section>
	);
}

const refKey = createRef<HTMLButtonElement>('computed-button');

/** Keeps an extracted computed ref binding attached through retained updates. */
export function ComputedRefMembers(this: Component<{ count: number }>) {
	this.state.count = 0;
	const method = 'ref' as const;
	const binding = this[method]?.(refKey);
	this.onMount(() => trace.push(binding.current ? 'ref-ready' : 'ref-missing'));
	return () => (
		<section>
			<output>{this.state.count}</output>
			<button ref={binding} onClick={() => this.state.count++}>
				Next
			</button>
		</section>
	);
}

/** Observes a first-class reactive value created through a computed component method. */
export function ComputedReactiveMembers(this: Component<{ count: number }>) {
	this.state.count = 0;
	const method = 'reactive' as const;
	const create = this[method];
	const value = create(() => this.state.count + 1);
	return () => (
		<section>
			<output>{value}</output>
			<button onClick={() => this.state.count++}>Next</button>
		</section>
	);
}

/** Preserves ordinary receiver methods whose names happen to match component operations. */
export function OrdinaryReceiverMembers(this: Component<{ count: number }>) {
	this.state.count = 0;
	const foreign = {
		own(value: number) {
			return value + 1;
		},
		onRender(value: number) {
			return value + 1;
		},
		ref(value: number) {
			return value + 1;
		},
		reactive(value: number) {
			return value + 1;
		},
		run() {
			return this.own(1) + this.onRender(2) + this.ref(3) + this.reactive(4);
		}
	};
	this.onMount(() => {
		this.state.count = foreign.run();
	});
	return () => (
		<section>
			<output>{this.state.count}</output>
			<button onClick={() => this.state.count++}>Next</button>
		</section>
	);
}

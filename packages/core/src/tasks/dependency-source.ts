import {
	isReactiveValue,
	ref as reactiveRef,
	subscribe,
	unwrap,
	type ReactiveRef,
	type ReactiveValue
} from '@exactjs/reactive/framework/runtime';
import { continuationDependencyForValue } from './dependency-provenance.js';

/** A dependency value together with the generation and publication version that produced it. */
export type ContinuationDependencySnapshot<T> =
	| Readonly<{ status: 'pending'; generation: number; version: number }>
	| Readonly<{ status: 'available'; generation: number; version: number; value: T }>
	| Readonly<{ status: 'failed'; generation: number; version: number; error: unknown }>
	| Readonly<{ status: 'cancelled'; generation: number; version: number; reason?: unknown }>;

/**
 * Supplies one compiler-identified continuation dependency.
 *
 * Implementations notify after their snapshot changes. Consumers must read a complete snapshot
 * after notification instead of treating the notification itself as a value publication.
 */
export interface ContinuationDependencySource<T = unknown> {
	read(): ContinuationDependencySnapshot<T>;
	subscribe(notify: () => void): Disposable;
}

/** A writable dependency source used to connect one continuation's output to its consumers. */
export interface ContinuationDependencySlot<T> extends ContinuationDependencySource<T> {
	/** Starts a generation whose value is not yet available and invalidates the prior generation. */
	beginGeneration(): number;
	/** Publishes a value only when the supplied generation is still current. */
	publish(generation: number, value: T): boolean;
	/** Terminates a generation with failure only when it is still current. */
	fail(generation: number, error: unknown): boolean;
	/** Terminates a generation through cancellation only when it is still current. */
	cancel(generation: number, reason?: unknown): boolean;
}

/** Creates an immutable dependency that is available from construction. */
export function constantContinuationDependency<T>(value: T): ContinuationDependencySource<T> {
	const snapshot: ContinuationDependencySnapshot<T> = {
		status: 'available',
		generation: 0,
		version: 0,
		value
	};
	return {
		read: () => snapshot,
		subscribe: () => inertDisposable
	};
}

/**
 * Adapts an authored activation input to the dependency protocol.
 *
 * Reactive values and reactive objects remain available while their publication version advances;
 * constants retain the same snapshot for the lifetime of the activation.
 */
export function activationInputDependency<T>(
	input: T | ReactiveValue<T>
): ContinuationDependencySource<T> {
	const planned = continuationDependencyForValue(input);
	if (planned) return planned as ContinuationDependencySource<T>;
	const source = reactiveRef(input);
	if (!source) return constantContinuationDependency(input as T);
	return reactiveContinuationDependency(input, source);
}

/** Returns only a compiler-propagated dependency source without evaluating an ordinary value. */
export function plannedContinuationDependency<T>(
	input: T
): ContinuationDependencySource<unknown> | undefined {
	return continuationDependencyForValue(input);
}

/** Creates a pending output slot whose generations are explicitly published by a producer. */
export function createContinuationDependencySlot<T>(): ContinuationDependencySlot<T> {
	let generation = 0;
	let version = 0;
	let snapshot: ContinuationDependencySnapshot<T> = { status: 'pending', generation, version };
	const subscribers = new DependencySubscribers();
	const publishSnapshot = (next: ContinuationDependencySnapshot<T>): void => {
		snapshot = next;
		subscribers.notify();
	};
	return {
		read: () => snapshot,
		subscribe(notify) {
			return subscribers.subscribe(notify);
		},
		beginGeneration() {
			generation++;
			version = 0;
			publishSnapshot({ status: 'pending', generation, version });
			return generation;
		},
		publish(candidateGeneration, value) {
			if (candidateGeneration !== generation) return false;
			if (snapshot.status === 'available' && Object.is(snapshot.value, value)) return false;
			publishSnapshot({ status: 'available', generation, version: ++version, value });
			return true;
		},
		fail(candidateGeneration, error) {
			if (candidateGeneration !== generation) return false;
			publishSnapshot({ status: 'failed', generation, version: ++version, error });
			return true;
		},
		cancel(candidateGeneration, reason) {
			if (candidateGeneration !== generation) return false;
			publishSnapshot({ status: 'cancelled', generation, version: ++version, reason });
			return true;
		}
	};
}

function reactiveContinuationDependency<T>(
	input: T | ReactiveValue<T>,
	source: ReactiveRef
): ContinuationDependencySource<T> {
	let version = 0;
	let dirty = true;
	let snapshot: ContinuationDependencySnapshot<T>;
	return {
		read() {
			if (dirty) {
				snapshot = {
					status: 'available',
					generation: 0,
					version,
					value: (isReactiveValue(input) ? unwrap(input) : input) as T
				};
				dirty = false;
			}
			return snapshot;
		},
		subscribe(notify) {
			return disposable(
				subscribe(source, () => {
					version++;
					dirty = true;
					notify();
				})
			);
		}
	};
}

const inertDisposable: Disposable = { [Symbol.dispose]() {} };

function disposable(dispose: () => void): Disposable {
	return { [Symbol.dispose]: dispose };
}

type DependencySubscriber = {
	readonly notify: () => void;
	active: boolean;
	previous?: DependencySubscriber;
	next?: DependencySubscriber;
};

class DependencySubscribers {
	#first?: DependencySubscriber;
	#last?: DependencySubscriber;

	subscribe(notify: () => void): Disposable {
		const subscriber: DependencySubscriber = {
			notify,
			active: true,
			previous: this.#last
		};
		if (this.#last) this.#last.next = subscriber;
		else this.#first = subscriber;
		this.#last = subscriber;
		return disposable(() => this.#remove(subscriber));
	}

	notify(): void {
		const last = this.#last;
		let subscriber = this.#first;
		while (subscriber) {
			const next = subscriber.next;
			if (subscriber.active) subscriber.notify();
			if (subscriber === last) return;
			subscriber = next;
		}
	}

	#remove(subscriber: DependencySubscriber): void {
		if (!subscriber.active) return;
		subscriber.active = false;
		if (subscriber.previous) subscriber.previous.next = subscriber.next;
		else this.#first = subscriber.next;
		if (subscriber.next) subscriber.next.previous = subscriber.previous;
		else this.#last = subscriber.previous;
	}
}

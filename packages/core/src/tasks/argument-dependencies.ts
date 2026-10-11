import {
	compilerContinuationDependency,
	createTrackedContinuationDependency
} from './dependency-source.js';
import type { ContinuationDependencySource } from './dependency-source.js';

/**
 * Projects a fixed task argument vector into activation dependencies. The shared
 * reader evaluates spreads and iterators once per invalidation, retaining argument
 * order and missing default inputs without adding another task frame.
 */
export function createTaskArgumentDependencies<Args extends readonly unknown[]>(
	compute: () => Args,
	count: number
): { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> } {
	if (!Number.isSafeInteger(count) || count < 0)
		throw new RangeError('Invalid task argument count');
	if (count === 0) {
		compute();
		return [] as unknown as { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> };
	}
	const vector = createTrackedContinuationDependency(compute);
	const subscribers = new Map<() => void, number>();
	let subscription: Disposable | undefined;
	const dependencies = Array.from({ length: count }, (_, index) =>
		compilerContinuationDependency({
			read() {
				const snapshot = vector.read();
				return snapshot.status === 'available'
					? { ...snapshot, value: snapshot.value[index] }
					: snapshot;
			},
			subscribe(notify) {
				subscribers.set(notify, (subscribers.get(notify) ?? 0) + 1);
				try {
					subscription ??= vector.subscribe(() => {
						for (const notify of subscribers.keys()) notify();
					});
				} catch (error) {
					const count = subscribers.get(notify)! - 1;
					if (count) subscribers.set(notify, count);
					else subscribers.delete(notify);
					throw error;
				}
				let active = true;
				return {
					[Symbol.dispose]() {
						if (!active) return;
						active = false;
						const count = subscribers.get(notify)! - 1;
						if (count) subscribers.set(notify, count);
						else subscribers.delete(notify);
						if (!subscribers.size) {
							subscription?.[Symbol.dispose]();
							subscription = undefined;
						}
					}
				};
			}
		})
	);
	return dependencies as unknown as {
		[Index in keyof Args]: ContinuationDependencySource<Args[Index]>;
	};
}

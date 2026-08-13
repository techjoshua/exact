import type { RefBinding, RefKey, RootBinding, RootIntroduction } from '@exactjs/core';

/** Creates a small structural ref binding for package behavior tests. */
export function testRefBinding<T>(initial?: T): RefBinding<T> {
	let current = initial;
	return {
		get current() {
			return current;
		},
		key: { id: Symbol('test-ref'), description: 'test ref' } as RefKey<T>,
		owner: {} as RefBinding<T>['owner'],
		fulfill(value) {
			current = value;
		}
	};
}

/** Creates a published component-root binding for focus and navigation tests. */
export function testRootBinding<T extends object>(
	initial: T,
	introduction: RootIntroduction = 'initial'
): RootBinding<T> {
	return Object.assign(testRefBinding(initial), {
		generation: 1,
		introduction,
		presented: true,
		release: undefined
	});
}

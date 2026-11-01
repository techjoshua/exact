type ArrayMutationApi = Pick<
	typeof import('@exactjs/reactive'),
	'reactive' | 'watch' | 'flushSync' | 'captureReactiveMutations' | 'computed'
>;

/** Owns native array end-operation scenarios shared by source and installed-runtime acceptance. */
export const arrayEndMutationCases = [
	'partial push',
	'argument push',
	'prototype push',
	'prototype rollback',
	'fixed-length pop',
	'accessor pop',
	'rejected push',
	'ordinary ends',
	'rollback'
] as const;

/** Checks partial mutations, notification and rollback without changing native completion behavior. */
export function verifyArrayEndMutations(
	api: ArrayMutationApi,
	cases: readonly (typeof arrayEndMutationCases)[number][] = arrayEndMutationCases
): void {
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('Array end mutation: ' + message);
	};
	for (const scenario of cases) {
		const inheritedFailure = scenario === 'prototype push' || scenario === 'prototype rollback';
		const raw = inheritedFailure ? new Array<string>(1024) : ['a', 'b'];
		if (inheritedFailure) raw[0] = 'a';
		if (scenario === 'partial push') {
			raw.length = 1;
			const prototype = Object.create(Array.prototype);
			Object.defineProperty(prototype, '2', { value: 'blocked', writable: false });
			Object.setPrototypeOf(raw, prototype);
		} else if (scenario === 'fixed-length pop' || scenario === 'rollback')
			Object.defineProperty(raw, 'length', { writable: false });
		else if (scenario === 'accessor pop')
			Object.defineProperty(raw, '1', {
				configurable: true,
				enumerable: true,
				get() {
					raw[0] = 'changed';
					return 'b';
				}
			});
		else if (scenario === 'rejected push') Object.preventExtensions(raw);
		const originalPrototypeSlot = Object.getOwnPropertyDescriptor(Array.prototype, '1025');
		const restorePrototypeSlot = () => {
			if (!inheritedFailure) return;
			if (originalPrototypeSlot)
				Object.defineProperty(Array.prototype, '1025', originalPrototypeSlot);
			else Reflect.deleteProperty(Array.prototype, '1025');
		};
		const events: string[] = [];
		const items = api.reactive<unknown[]>(raw, {
			onMutation(_key, operation) {
				events.push(operation);
			}
		});
		const seen: string[] = [];
		const snapshot =
			scenario === 'accessor pop'
				? () => String(items[0])
				: () => `${items.length}:${items[0]}:${items[1]}`;
		const release = api.watch(() => seen.push(snapshot()));
		seen.length = 0;
		try {
			let error: unknown;
			const operation = () => {
				try {
					if (scenario === 'argument push') {
						const argument = api.computed(() => {
							const prototype = Object.create(Array.prototype);
							Object.defineProperty(prototype, '3', { value: 'blocked', writable: false });
							Object.setPrototypeOf(raw, prototype);
							return 'b';
						});
						items.push(argument, 'c');
					} else if (
						scenario === 'partial push' ||
						scenario === 'rejected push' ||
						inheritedFailure
					)
						items.push('b', 'c');
					else if (scenario === 'ordinary ends') {
						check(items.push('c') === 3, 'push returns the native length');
						api.flushSync();
						check(items.pop() === 'c', 'pop returns the native item');
					} else if (scenario === 'accessor pop')
						check(items.pop() === 'b', 'accessor pop returns its item');
					else items.pop();
				} catch (failure) {
					error = failure;
				}
			};
			if (inheritedFailure)
				Object.defineProperty(Array.prototype, '1025', {
					value: 'blocked',
					writable: false,
					configurable: true
				});
			const journal =
				scenario === 'rollback' || scenario === 'prototype rollback'
					? api.captureReactiveMutations(operation)
					: (operation(), undefined);
			restorePrototypeSlot();
			api.flushSync();
			if (inheritedFailure) {
				check(
					error instanceof TypeError && raw.length === 1025 && raw[1024] === 'b',
					'prototype constraint preserves native partial failure'
				);
				check(
					seen[0] === '1025:a:undefined' && events[0] === 'push',
					'prototype constraint publishes the partial append'
				);
				if (journal) {
					journal.rollback();
					api.flushSync();
					check(
						raw.length === 1024 && !Object.hasOwn(raw, '1024') && seen[1] === '1024:a:undefined',
						'prototype-constrained push can roll back'
					);
				}
			} else if (scenario === 'argument push') {
				check(
					error instanceof TypeError && raw.length === 3 && raw[2] === 'b',
					'argument normalization preserves native partial failure'
				);
				check(
					seen[0] === '3:a:b' && events[0] === 'push',
					'argument normalization precedes fast-path eligibility'
				);
			} else if (scenario === 'partial push') {
				check(
					error instanceof TypeError && raw.length === 2 && raw[1] === 'b',
					'partial push preserves native failure and data'
				);
				check(seen[0] === '2:a:b' && events[0] === 'push', 'partial push is observable');
			} else if (scenario === 'fixed-length pop' || scenario === 'rollback') {
				check(
					error instanceof TypeError && raw.length === 2 && !Object.hasOwn(raw, '1'),
					'partial pop preserves native failure and hole'
				);
				check(seen[0] === '2:a:undefined' && events[0] === 'pop', 'partial pop is observable');
				if (journal) {
					journal.rollback();
					api.flushSync();
					check(
						raw[1] === 'b' && seen[1] === '2:a:b',
						'rollback restores the removed descriptor and notifies'
					);
				}
			} else if (scenario === 'accessor pop')
				check(
					!error && raw[0] === 'changed' && seen[0] === 'changed',
					'accessor side effects are observable'
				);
			else if (scenario === 'rejected push')
				check(
					error instanceof TypeError &&
						raw.length === 2 &&
						seen.length === 0 &&
						events.length === 0,
					'rejection without mutation stays quiet'
				);
			else
				check(
					!error && seen.join('|') === '3:a:b|2:a:b' && events.join('|') === 'push|pop',
					'ordinary ends retain notification and return behavior'
				);
		} finally {
			restorePrototypeSlot();
			release();
		}
	}
}

import {
	isReactiveValue,
	collectionRef,
	createEffectScope,
	peek,
	registerEffectScopeCleanup,
	registerReactiveListKey,
	unwrap,
	withEffectScope,
	type EffectScope,
	type ReactiveRef,
	type ReactiveValue,
	type StopHandle
} from '@exactjs/reactive/framework/runtime';

import { createCompiledKeyedChildReceipt } from '../component-abi/keyed-child-receipt.js';
import { createCompiledChildRangeReceipt } from './reactive-expressions.js';
import type { Child } from './contracts.js';

type ListCache = Map<string, { item: unknown; operation: Child; keyed: Child; scope: EffectScope }>;

/** Owns keyed-list registrations and compiler-operation caches retained by one component instance. */
export function createComponentListController(ownerScope: EffectScope) {
	const caches = new Map<string, { render: unknown; cache: ListCache }>();
	const registrations = new Map<
		string,
		{ collection: object; identity: string; stop: StopHandle }
	>();
	const activeSlots = new Set<string>();
	const directSlots = new Set<string>();
	let mapCallIndex = 0;

	return {
		beginRender(): void {
			mapCallIndex = 0;
			activeSlots.clear();
		},
		endRender(): void {
			for (const [slot, registration] of registrations) {
				if (activeSlots.has(slot) || directSlots.has(slot)) continue;
				registration.stop();
				registrations.delete(slot);
				caches.delete(slot);
			}
		},
		dispose(): void {
			for (const registration of registrations.values()) registration.stop();
			registrations.clear();
			caches.clear();
			directSlots.clear();
		},
		map<T>(
			collection: Iterable<T> | ReactiveValue<Iterable<T>>,
			key: (item: T) => string,
			render: (item: T) => Child,
			id?: string,
			provenance?: Iterable<T>,
			keyIdentity?: string,
			direct = false
		): Child | Child[] {
			const source = peek(() => collectionRef(collection as object)) as
				| ReactiveRef<Iterable<T>>
				| undefined;
			const current =
				isReactiveValue(collection) && source
					? peek(() => source.get())
					: (collection as Iterable<T>);
			const cacheId = id ?? `map:${mapCallIndex++}`;
			activeSlots.add(cacheId);
			if (direct) directSlots.add(cacheId);
			const registrationCollection = unwrap(provenance ?? current) as object;
			const registrationIdentity = keyIdentity ?? Function.prototype.toString.call(key);
			const registered = registrations.get(cacheId);
			if (
				!registered ||
				registered.collection !== registrationCollection ||
				registered.identity !== registrationIdentity
			) {
				registered?.stop();
				const stop = registerReactiveListKey(
					provenance ?? current,
					key as (item: unknown) => string,
					id ?? 'an unlabelled this.map() call',
					keyIdentity
				);
				registrations.set(cacheId, {
					collection: registrationCollection,
					identity: registrationIdentity,
					stop
				});
			}
			const previous = caches.get(cacheId);
			// A compiler id identifies one stable authored map site. Its render closure is
			// recreated when an enclosing reactive expression runs, but cached item operations
			// already contain their own live readers and must retain identity.
			const cache = id !== undefined || previous?.render === render ? previous?.cache : undefined;
			const activeCache = cache ?? new Map();
			if (!previous || previous.render !== render)
				caches.set(cacheId, { render, cache: activeCache });
			const materialize = () => {
				const values: Iterable<T> = source
					? source.get()
					: isReactiveValue(collection)
						? (collection.get() as Iterable<T>)
						: (collection as Iterable<T>);
				const activeKeys = new Set<string>();
				const result: Child[] = [];
				for (const item of values) {
					const itemKey = String(key(item));
					if (activeKeys.has(itemKey))
						throw new Error(
							`Duplicate key "${itemKey}" in ${id ?? 'an unlabelled this.map() call'}`
						);
					activeKeys.add(itemKey);
					let cached = activeCache.get(itemKey);
					if (!cached || !Object.is(unwrap(cached.item), unwrap(item))) {
						const scope = createEffectScope(ownerScope);
						let operation: Child;
						try {
							operation = withEffectScope(scope, () => render(item));
						} catch (error) {
							scope.stop();
							throw error;
						}
						cached = {
							item,
							operation,
							keyed: createCompiledKeyedChildReceipt(operation, itemKey, scope),
							scope
						};
						activeCache.set(itemKey, cached);
						registerEffectScopeCleanup(scope, () => {
							if (activeCache.get(itemKey)?.scope === scope) activeCache.delete(itemKey);
						});
					}
					result.push(cached.keyed);
				}
				for (const cachedKey of activeCache.keys())
					if (!activeKeys.has(cachedKey)) activeCache.delete(cachedKey);
				return result;
			};
			return direct ? materialize() : createCompiledChildRangeReceipt(materialize, id);
		}
	};
}

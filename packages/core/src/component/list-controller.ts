import {
	isReactiveValue,
	peek,
	ref as reactiveRef,
	registerReactiveListKey,
	unwrap,
	type ReactiveRef,
	type ReactiveValue,
	type StopHandle
} from '@exactjs/reactive';

import { Fragment } from '../symbols.js';
import { createVNode } from '../vnode.js';
import type { ListBinding, VNode } from './contracts.js';

type ListCache = Map<string, { item: unknown; vnode: VNode }>;

/** Owns the keyed-list registrations and vnode caches retained by one component instance. */
export function createComponentListController() {
	const caches = new Map<string, { render: unknown; cache: ListCache }>();
	const registrations = new Map<
		string,
		{ collection: object; identity: string; stop: StopHandle }
	>();
	const activeSlots = new Set<string>();
	let mapCallIndex = 0;

	return {
		beginRender(): void {
			mapCallIndex = 0;
			activeSlots.clear();
		},
		endRender(): void {
			for (const [slot, registration] of registrations) {
				if (activeSlots.has(slot)) continue;
				registration.stop();
				registrations.delete(slot);
				caches.delete(slot);
			}
		},
		dispose(): void {
			for (const registration of registrations.values()) registration.stop();
			registrations.clear();
			caches.clear();
		},
		map<T>(
			collection: Iterable<T> | ReactiveValue<Iterable<T>>,
			key: (item: T) => string,
			render: (item: T) => VNode,
			id?: string,
			provenance?: Iterable<T>,
			keyIdentity?: string
		): VNode {
			const source = peek(() => reactiveRef(collection)) as ReactiveRef<Iterable<T>> | undefined;
			const current =
				isReactiveValue(collection) && source
					? peek(() => source.get())
					: (collection as Iterable<T>);
			const cacheId = id ?? `map:${mapCallIndex++}`;
			activeSlots.add(cacheId);
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
			const cache = previous?.render === render ? previous.cache : new Map();
			if (!previous || previous.render !== render) caches.set(cacheId, { render, cache });
			return createVNode(Fragment, {
				key: id,
				list: {
					collection: current,
					source,
					key,
					render,
					cache: cache as Map<string, { item: T; vnode: VNode }>
				} satisfies ListBinding<T>
			});
		}
	};
}

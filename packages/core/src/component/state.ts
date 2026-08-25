import type { Reactive, ReactiveOptions } from '@exactjs/reactive/framework/runtime';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { reactiveObjects } from '@exactjs/reactive/framework/objects';
import type { ComponentDomain, ComponentInstance } from './contracts.js';
import { componentDomainInspection } from './domain.js';

/** Creates inspectable component state before the final instance reference is assigned. */
export function createComponentState<State extends object>(
	domain: ComponentDomain,
	instance: () => ComponentInstance<State> | undefined,
	indexedKeys?: readonly string[],
	collections = false
): Reactive<State> {
	const options: ReactiveOptions = {
		onMutation(key, operation) {
			const component = instance();
			if (!component) return;
			componentDomainInspection(domain)?.publish({
				kind: 'state.change',
				component,
				path: key === undefined ? 'state' : `state.${String(key)}`,
				attributes: Object.freeze({ operation })
			});
		}
	};
	if (collections) {
		if (!collectionStateFactory)
			throw new Error('Collection state requires the compiler-selected collection capability');
		return collectionStateFactory<State>(indexedKeys, options);
	}
	return indexedKeys?.length
		? indexedReactiveObjects<State>(indexedKeys, options)
		: reactiveObjects({} as State, options);
}

type CollectionStateFactory = <State extends object>(
	indexedKeys: readonly string[] | undefined,
	options: ReactiveOptions
) => Reactive<State>;

let collectionStateFactory: CollectionStateFactory | undefined;

/** Registers general Map/Set-aware component state when selected by a compiled artifact. */
export function registerCollectionComponentStateFactory(factory: CollectionStateFactory): void {
	if (collectionStateFactory && collectionStateFactory !== factory)
		throw new Error('Conflicting eXact collection-state capability integration');
	collectionStateFactory = factory;
}

/** Creates readonly reactive props while preserving compiler-owned children passthrough. */
export function createComponentProps<Props extends Record<string, unknown>>(
	rawProps: Props,
	indexedKeys?: readonly string[],
	collections = false
): Reactive<Record<string, unknown>> {
	const options: ReactiveOptions = {
		readonly: true,
		passthroughKeys: ['children'],
		onReadonlyWrite(key: PropertyKey) {
			throw new TypeError(`Cannot write to readonly props.${String(key)}`);
		}
	};
	if (collections) {
		if (!collectionPropsFactory)
			throw new Error('Collection props require the compiler-selected collection capability');
		return collectionPropsFactory(rawProps, indexedKeys, options);
	}
	return indexedKeys?.length
		? indexedReactiveObjects<Record<string, unknown>>(indexedKeys, options, rawProps, true)
		: (reactiveObjects(rawProps, options) as Reactive<Record<string, unknown>>);
}

type CollectionPropsFactory = (
	value: Record<string, unknown>,
	indexedKeys: readonly string[] | undefined,
	options: ReactiveOptions
) => Reactive<Record<string, unknown>>;

let collectionPropsFactory: CollectionPropsFactory | undefined;

/** Registers general Map/Set-aware component props with the collection-state capability. */
export function registerCollectionComponentPropsFactory(factory: CollectionPropsFactory): void {
	if (collectionPropsFactory && collectionPropsFactory !== factory)
		throw new Error('Conflicting eXact collection-props capability integration');
	collectionPropsFactory = factory;
}

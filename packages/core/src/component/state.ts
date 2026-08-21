import { indexedReactive, reactive, type Reactive, type ReactiveOptions } from '@exactjs/reactive';
import type { ComponentDomain, ComponentInstance } from './contracts.js';
import { componentDomainInspection } from './domain.js';

/** Creates inspectable component state before the final instance reference is assigned. */
export function createComponentState<State extends object>(
	domain: ComponentDomain,
	instance: () => ComponentInstance<State> | undefined,
	indexedKeys?: readonly string[]
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
	return indexedKeys?.length
		? indexedReactive<State>(indexedKeys, options)
		: reactive({} as State, options);
}

/** Creates readonly reactive props while preserving compiler-owned children passthrough. */
export function createComponentProps<Props extends Record<string, unknown>>(
	rawProps: Props
): Reactive<Record<string, unknown>> {
	return reactive(rawProps, {
		readonly: true,
		passthroughKeys: ['children'],
		onReadonlyWrite(key) {
			throw new TypeError(`Cannot write to readonly props.${String(key)}`);
		}
	}) as Reactive<Record<string, unknown>>;
}

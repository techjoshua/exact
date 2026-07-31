import { reactive, type Reactive } from '@exactjs/reactive';
import type { ComponentDomain, ComponentInstance } from './contracts.js';

/** Creates inspectable component state before the final instance reference is assigned. */
export function createComponentState<State extends object>(
	domain: ComponentDomain,
	instance: () => ComponentInstance<State> | undefined
): Reactive<State> {
	return reactive({} as State, {
		onMutation(key, operation) {
			const component = instance();
			if (!component) return;
			domain.inspection?.publish({
				kind: 'state.change',
				component,
				path: key === undefined ? 'state' : `state.${String(key)}`,
				attributes: Object.freeze({ operation })
			});
		}
	});
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

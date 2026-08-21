import { peek, reactive, unwrap } from '@exactjs/reactive';
import { watchRetained } from '@exactjs/reactive/framework/watch';
import {
	exactComponentIdentity,
	isExactComponent,
	readExactComponentContract
} from '../component-contracts.js';
import type {
	AuthoredComponentFunction,
	Child,
	ComponentFunction,
	VNode
} from '../component/contracts.js';
import { createDynamicChild, createVNode } from '../vnode.js';
import { dynamicComponentResolverFor } from './creation.js';
import type {
	AnyDynamicComponentCandidate,
	DynamicComponentCandidate,
	DynamicComponentInspection,
	DynamicComponentResolution,
	DynamicComponentResolver,
	DynamicComponentStatus
} from './contracts.js';

type DynamicState<Props extends Record<string, unknown>> = {
	revision: number;
	status: DynamicComponentStatus;
	generation: number;
	candidate?: DynamicComponentCandidate<Props>;
	error?: unknown;
	pending?: Promise<void>;
};

/** Compiler-only options for creating one client dynamic component range. */
export type CompiledDynamicComponentOptions<Props extends Record<string, unknown>> = Readonly<{
	id: string;
	source:
		| DynamicComponentResolver<Props>
		| AuthoredComponentFunction<Record<string, unknown>, Props>;
	props: Props;
}>;

/**
 * Creates the canonical dynamic range used by generated client artifacts.
 *
 * Resolution is generation-fenced and owned by the current component effect scope. Server
 * renderers recognize the attached marker and never read the reactive candidate value.
 */
export function createCompiledDynamicComponent<Props extends Record<string, unknown>>(
	options: CompiledDynamicComponentOptions<Props>
): VNode {
	if (!options.id) throw new TypeError('Compiled dynamic components require a stable identity');
	const resolver =
		dynamicComponentResolverFor<Props>(options.source) ??
		(options.source as DynamicComponentResolver<Props>);
	if (typeof resolver !== 'function')
		throw new TypeError('Compiled dynamic components require a resolver or authored facade');

	const lifetime = reactive({ retained: true });
	const state = reactive<DynamicState<Props>>({
		revision: 0,
		status: 'unassigned',
		generation: 0
	});
	let controller: AbortController | undefined;
	const control = { generation: 0 };

	watchRetained(
		() => {
			void lifetime.retained;
			const generation = ++control.generation;
			controller?.abort();
			controller = new AbortController();
			let result: DynamicComponentResolution<Props> | Promise<DynamicComponentResolution<Props>>;
			try {
				result = resolver(controller.signal);
			} catch (error) {
				settleFailure(state, control, generation, error);
				return;
			}
			state.generation = generation;
			if (isPromiseLike(result)) {
				state.status = 'pending';
				state.candidate = undefined;
				state.error = undefined;
				const pending = Promise.resolve(result).then(
					(candidate) => {
						try {
							settleCandidate(state, control, generation, candidate);
						} catch (error) {
							settleFailure(state, control, generation, error);
						}
					},
					(error) => settleFailure(state, control, generation, error)
				);
				state.pending = pending;
				bumpRevision(state);
				return;
			}
			try {
				settleCandidate(state, control, generation, result);
			} catch (error) {
				settleFailure(state, control, generation, error);
			}
		},
		undefined,
		{
			onSchedule: () => controller?.abort(),
			onRelease: () => controller?.abort()
		}
	);

	const inspection = dynamicInspection(options.id, state);
	const vnode = createDynamicChild(() => {
		void state.revision;
		switch (state.status) {
			case 'available':
				return createVNode(state.candidate! as ComponentFunction<Record<string, unknown>, Props>, {
					...options.props,
					key: `exact-dynamic:${options.id}:${state.generation}`
				});
			default:
				return [] as Child[];
		}
	}, options.id);
	return {
		...vnode,
		props: {
			...vnode.props,
			__exactDynamicComponent: inspection,
			__exactDynamicComponentProps: options.props,
			__exactDynamicComponentReadiness: () => state.pending
		}
	};
}

/** Creates the inert server projection of an open client-only dynamic boundary. */
export function createServerDynamicComponent(id: string): VNode {
	if (!id) throw new TypeError('Server dynamic components require a stable identity');
	const inspection: DynamicComponentInspection = Object.freeze({
		id,
		status: 'unassigned',
		generation: 0
	});
	const vnode = createDynamicChild(() => {
		throw new Error('Server rendering cannot resolve an open dynamic component');
	}, id);
	return {
		...vnode,
		props: { ...vnode.props, __exactDynamicComponent: inspection }
	};
}

/** Creates a resolver for an annotated component-position expression. */
export function dynamicComponentValue<Props extends Record<string, unknown>>(
	read: () => DynamicComponentResolution<Props>
): DynamicComponentResolver<Props> {
	return () => unwrap(read()) as DynamicComponentResolution<Props>;
}

function settleCandidate<Props extends Record<string, unknown>>(
	state: DynamicState<Props>,
	control: { generation: number },
	generation: number,
	candidate: DynamicComponentResolution<Props>
): void {
	if (control.generation !== generation) return;
	state.pending = undefined;
	state.error = undefined;
	if (candidate === null || candidate === undefined) {
		state.candidate = undefined;
		state.status = 'absent';
		bumpRevision(state);
		return;
	}
	validateCandidate(candidate);
	state.candidate = candidate;
	state.status = 'available';
	bumpRevision(state);
}

function settleFailure<Props extends Record<string, unknown>>(
	state: DynamicState<Props>,
	control: { generation: number },
	generation: number,
	error: unknown
): void {
	if (control.generation !== generation) return;
	state.generation = generation;
	state.pending = undefined;
	state.candidate = undefined;
	state.error = error;
	state.status = 'failed';
	bumpRevision(state);
}

function bumpRevision(state: { revision: number }): void {
	state.revision = peek(() => state.revision) + 1;
}

function validateCandidate(candidate: AnyDynamicComponentCandidate): void {
	if (!isExactComponent(candidate))
		throw new TypeError(
			'Dynamic component resolution requires a native or explicitly adapted component'
		);
	const contract = readExactComponentContract(candidate);
	if (!contract) return;
	if (
		contract.role === 'executor' ||
		contract.placement === 'server' ||
		contract.executors.length !== 0 ||
		contract.continuations.length !== 0 ||
		contract.execution?.transitions.some((transition) => transition[3] === 'server')
	) {
		throw new Error(
			`Dynamic component ${exactComponentIdentity(candidate)} declares server execution capability`
		);
	}
}

function dynamicInspection<Props extends Record<string, unknown>>(
	id: string,
	state: DynamicState<Props>
): DynamicComponentInspection {
	return Object.freeze({
		id,
		get status() {
			return state.status;
		},
		get generation() {
			return state.generation;
		},
		get componentId() {
			return state.candidate && isExactComponent(state.candidate)
				? exactComponentIdentity(state.candidate)
				: undefined;
		},
		get error() {
			return state.error;
		}
	});
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
	return (
		(typeof value === 'object' || typeof value === 'function') &&
		value !== null &&
		typeof (value as PromiseLike<T>).then === 'function'
	);
}

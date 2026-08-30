import { SuspensionContext, type Component, type ComponentFunction } from '@exactjs/core';
import '@exactjs/core/runtime/collections';
import '@exactjs/core/runtime/contexts';
import '@exactjs/core/runtime/lifecycle';
import '@exactjs/core/runtime/tasks';
import {
	exactComponentContract,
	exactComponentType,
	type ExactComponentContract
} from '@exactjs/core/framework/component-contracts';
import { constructDurableComponentInstance } from '@exactjs/core/runtime/component-construction/durable';
import {
	attachExactCompatibilityClientComponent,
	disposeExactClientComponent,
	disposeExactServerComponent,
	issueExactServerComponent,
	receiveExactDynamicClientComponentProps,
	writeExactServerComponent
} from '@exactjs/core/runtime/compatibility-component-abi';
import type { AnyReactComponentType } from '../types.js';
import { ReactClassIslandImplementation, isReactClassType } from './adapters.js';
import { reactCompatibilityArtifactTarget } from './adapter-identity.js';
import { ReactFunctionIslandImplementation } from './function-adapter.js';
import { ReactProfilerIslandImplementation } from './profiler-adapter.js';
import { REACT_PROFILER_TYPE, REACT_SUSPENSE_TYPE } from './shared.js';

type ReactIslandProps = Record<string, unknown> & {
	component: AnyReactComponentType | symbol;
};

const suspenseStates = new WeakMap<
	object,
	{ suspended: boolean; promise?: PromiseLike<unknown> }
>();

/** Executes one opaque React value inside the package's precompiled compatibility component. */
function executeReactIsland(
	component: Component<Record<string, unknown>>,
	props: ReactIslandProps
) {
	return Reflect.apply(
		props.component === REACT_SUSPENSE_TYPE
			? ReactSuspenseIslandImplementation
			: props.component === REACT_PROFILER_TYPE
				? ReactProfilerIslandImplementation
				: isReactClassType(props.component)
					? ReactClassIslandImplementation
					: ReactFunctionIslandImplementation,
		component,
		[props]
	);
}

/** React-owned readiness boundary that never projects its output into a native node shape. */
const ReactSuspenseIslandImplementation = function ReactSuspenseIsland(
	this: Component<Record<string, unknown>>,
	props: ReactIslandProps
) {
	this.state.__reactRevision = 0;
	let generation = 0;
	let suspended = false;
	const suspenseState: { suspended: boolean; promise?: PromiseLike<unknown> } = {
		suspended: false
	};
	suspenseStates.set(this as object, suspenseState);
	this.onUnmount(() => suspenseStates.delete(this as object));
	this.setContext(SuspensionContext, {
		suspend: (promise: PromiseLike<unknown>) => {
			const current = ++generation;
			suspended = true;
			suspenseState.suspended = true;
			suspenseState.promise = promise;
			(this as import('@exactjs/core').ComponentInstance<Record<string, unknown>>).invalidate?.();
			void Promise.resolve(promise).then(
				() => settle(current),
				() => settle(current)
			);
		}
	});
	const settle = (current: number) => {
		if (current !== generation) return;
		suspended = false;
		suspenseState.suspended = false;
		delete suspenseState.promise;
		(this as import('@exactjs/core').ComponentInstance<Record<string, unknown>>).invalidate?.();
	};
	return () => {
		return suspended ? props.fallback : props.children;
	};
} as ComponentFunction<Record<string, unknown>, ReactIslandProps>;

/** Reads readiness owned by a React Suspense island without exposing native renderer state. */
export function reactSuspenseIslandState(
	instance: object
): Readonly<{ suspended: boolean; promise?: PromiseLike<unknown> }> | undefined {
	return suspenseStates.get(instance);
}

const clientImplementation = function ExactReactClientIsland(
	this: Component<Record<string, unknown>>,
	props: ReactIslandProps
) {
	return executeReactIsland(this, props);
} as ComponentFunction<Record<string, unknown>, ReactIslandProps>;

const serverImplementation = function ExactReactServerIsland(
	this: Component<Record<string, unknown>>,
	props: ReactIslandProps
) {
	return executeReactIsland(this, props);
} as ComponentFunction<Record<string, unknown>, ReactIslandProps>;

const commonArtifact = {
	version: 1 as const,
	construct: constructDurableComponentInstance,
	abi: 30,
	capabilities: ['compatibility', 'collections', 'dynamic-components'] as const,
	state: ['__reactRevision'] as const,
	props: [] as const,
	opaqueProps: ['component'] as const,
	tasks: [] as const,
	reactive: [] as const,
	render: 'returned-function' as const
};

const clientContract: ExactComponentContract = {
	version: 3,
	placement: 'client',
	role: 'client',
	implementations: [
		{
			id: '@exactjs/react-compat:island:client:implementation',
			name: 'ExactReactClientIsland',
			role: 'root',
			implementation: clientImplementation
		}
	],
	continuations: [],
	executors: [],
	boundaries: [],
	execution: { version: 1, ports: [], transitions: [], reactive: [] },
	artifact: {
		...commonArtifact,
		target: 'client',
		id: '@exactjs/react-compat:island:client',
		instantiate: clientImplementation,
		attach: attachExactCompatibilityClientComponent,
		identityProps: ['component'],
		// React props are intentionally open-ended. The precompiled island owns
		// their dynamic facade; an empty indexed native-prop layout would discard
		// every parent receipt after construction.
		receive: receiveExactDynamicClientComponentProps,
		dispose: disposeExactClientComponent
	}
};

const serverContract: ExactComponentContract = {
	version: 3,
	placement: 'server',
	role: 'executor',
	implementations: [
		{
			id: '@exactjs/react-compat:island:server:implementation',
			name: 'ExactReactServerIsland',
			role: 'root',
			implementation: serverImplementation
		}
	],
	continuations: [],
	executors: [],
	boundaries: [],
	execution: { version: 1, ports: [], transitions: [], reactive: [] },
	artifact: {
		...commonArtifact,
		target: 'server',
		id: '@exactjs/react-compat:island:server',
		instantiate: serverImplementation,
		issue: issueExactServerComponent,
		write: writeExactServerComponent,
		dispose: disposeExactServerComponent,
		execution: { version: 1, classification: 'dynamic', lane: 'compatibility' }
	}
};

/** Precompiled client React-island artifact; no React component type is branded at runtime. */
export const ReactClientIsland = Object.assign(clientImplementation, {
	[exactComponentType]: '@exactjs/react-compat:island:client',
	[exactComponentContract]: clientContract
});

/** Precompiled server React-island artifact; request state remains outside the shared artifact. */
export const ReactServerIsland = Object.assign(serverImplementation, {
	[exactComponentType]: '@exactjs/react-compat:island:server',
	[exactComponentContract]: serverContract
});

/** Selects the already published target artifact without defining or adapting a component. */
export function reactIslandArtifact(): typeof ReactClientIsland | typeof ReactServerIsland {
	return reactCompatibilityArtifactTarget() === 'server' ? ReactServerIsland : ReactClientIsland;
}

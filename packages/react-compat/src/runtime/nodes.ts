import { type AnyComponentFunction } from '@exactjs/core';
import {
	createCompatibilityContribution,
	compatibilityContributionKey,
	isCompatibilityContribution,
	type ExactCompatibilityContribution
} from '@exactjs/core/framework/compatibility-contributions';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import '@exactjs/core/runtime/contexts';
import { isExactComponent } from '@exactjs/core/framework/component-contracts';
import {
	REACT_CONSUMER_TYPE,
	REACT_CONTEXT_TYPE,
	REACT_FORWARD_REF_TYPE,
	REACT_FRAGMENT_TYPE,
	REACT_LAZY_TYPE,
	REACT_MEMO_TYPE,
	REACT_PORTAL_TYPE,
	REACT_PROVIDER_TYPE,
	reactElementSymbol,
	reactCompatibilityTarget
} from './shared.js';
import { activeHookHost, currentReactOwnerFrame } from '../internals.js';
import {
	contextForSpecial,
	isReactClassType,
	reactTypeName,
	unsupportedType
} from './class-support.js';
import { EXACT_COMPONENT_TYPE } from './shared.js';
import type {
	AnyReactComponentType,
	ReactComponentType,
	ReactElement,
	ReactNode,
	ReactOpaqueValue,
	ReactSpecialType
} from '../types.js';
import { reactIslandArtifact } from './island-artifacts.js';
const NativeArray = Array;
const nativeArrayMap = Array.prototype.map;
/** An in-progress native array projection, retaining map's length snapshot and sparse cells. */
type ProjectionFrame = {
	source: unknown[];
	output: object;
	length: number;
	index: number;
	parentIndex: number;
	ordinary: boolean;
};
/** Creates map's species-selected target before reading or projecting the first child. */
function projectionFrame(source: unknown[], parentIndex: number): ProjectionFrame {
	const length = Math.min(Math.max(Math.trunc(+source.length) || 0, 0), Number.MAX_SAFE_INTEGER);
	let constructor: unknown = source.constructor;
	if (
		constructor !== null &&
		(typeof constructor === 'object' || typeof constructor === 'function')
	) {
		constructor = Reflect.get(constructor, Symbol.species);
		if (constructor === null) constructor = undefined;
	}
	const ordinary = constructor === undefined || constructor === NativeArray;
	const output = ordinary
		? new NativeArray(length)
		: Reflect.construct(constructor as new (length: number) => object, [length]);
	return { source, output, length, index: 0, parentIndex, ordinary };
}
/** Uses map's own-data writes, retaining its behavior when prototype setters or custom species are involved. */
function writeProjection(frame: ProjectionFrame, index: number, value: ReactNode): void {
	if (frame.ordinary && !(index in NativeArray.prototype))
		(frame.output as ReactNode[])[index] = value;
	else
		Object.defineProperty(frame.output, index, {
			value,
			enumerable: true,
			writable: true,
			configurable: true
		});
}
/**
 * Projects native eXact children into opaque React element records.
 *
 * React-owned wrappers may inspect, clone, and key only the private React carrier. The carrier
 * retains the opaque supplier capability and never contains or materializes the native value.
 * Native array mapping is iterative and preserves sparse cells, captured lengths, species targets
 * and getter order. Authored map overrides retain their own call path. Ancestor cycles reject.
 */
export function toReactNode(node: unknown): ReactNode {
	if (!Array.isArray(node)) return projectContribution(node);
	const map = node.map;
	if (map !== nativeArrayMap || Object.getPrototypeOf(node) !== NativeArray.prototype)
		return Reflect.apply(map, node, [toReactNode]);
	const frames = [projectionFrame(node, -1)];
	const active = new WeakSet<object>([node]);
	while (frames.length) {
		const frame = frames[frames.length - 1]!;
		if (frame.index >= frame.length) {
			frames.pop();
			active.delete(frame.source);
			if (!frames.length) return frame.output as ReactNode;
			writeProjection(frames[frames.length - 1]!, frame.parentIndex, frame.output as ReactNode);
			continue;
		}
		const index = frame.index++;
		if (!(index in frame.source)) continue;
		const child = frame.source[index];
		if (Array.isArray(child)) {
			if (active.has(child)) throw new TypeError('Cyclic React child array');
			const map = child.map;
			if (map === nativeArrayMap && Object.getPrototypeOf(child) === NativeArray.prototype) {
				active.add(child);
				frames.push(projectionFrame(child, index));
				continue;
			}
			writeProjection(frame, index, Reflect.apply(map, child, [toReactNode]));
		} else writeProjection(frame, index, projectContribution(child));
	}
	throw new Error('React child projection did not produce a result');
}
/** Preserves React-owned leaves and wraps only compiler-owned native contribution capabilities. */
function projectContribution(node: unknown): ReactNode {
	if (!isCompatibilityContribution(node)) return node as ReactNode;
	const type = ExactContributionBoundaryType as ReactComponentType<Record<string, unknown>>;
	return {
		$$typeof: reactElementSymbol(),
		type,
		key: compatibilityContributionKey(node) ?? null,
		ref: null,
		props: { contribution: node },
		_owner: currentReactOwnerFrame(),
		_store: { validated: 0 }
	};
}
const ExactContributionBoundaryType = function ReactExactContributionBoundary(): never {
	throw new Error('Opaque native contribution must be placed by @exactjs/react-compat');
};
/** Reads or creates only the opaque native operation carried by a React boundary element. */
export function reactElementCompatibilityContribution(
	element: ReactElement<ReactOpaqueValue>
): ExactCompatibilityContribution | undefined {
	const elementProps = element.props as Record<string, unknown> & {
		children?: ReactNode;
	};
	if (element.type === ExactContributionBoundaryType) {
		const contribution = elementProps.contribution;
		if (!isCompatibilityContribution(contribution))
			throw new TypeError('React native-contribution carrier lost its opaque handle');
		return contribution;
	}
	const exactBoundary = exactComponentType(element.type);
	if (!exactBoundary) return undefined;
	const props = { ...elementProps };
	const children = props.children as ReactNode;
	delete props.children;
	if (element.ref !== null && element.ref !== undefined && exactBoundary.refProp !== undefined)
		Reflect.set(props, exactBoundary.refProp, element.ref);
	const nativeChildren =
		children === undefined
			? []
			: [
					createCompiledComponentInputReceipt(reactIslandArtifact(), {
						component: REACT_FRAGMENT_TYPE,
						children
					})
				];
	const operation = createCompiledComponentInputReceipt(exactBoundary.component, props, {
		kind: 'eager',
		values: [...nativeChildren]
	});
	return createCompatibilityContribution(
		(target) => target.place(operation),
		element.key === null ? undefined : String(element.key)
	);
}
/** Performs the exact component type domain operation. */
export function exactComponentType(type: unknown):
	| {
			component: AnyComponentFunction;
			refProp?: PropertyKey;
	  }
	| undefined {
	if ((typeof type !== 'function' && typeof type !== 'object') || type === null) return undefined;
	if (typeof type === 'function' && isExactComponent(type))
		return { component: type as AnyComponentFunction };
	const candidate = type as {
		$$typeof?: unknown;
		exactComponent?: unknown;
		exactRefProp?: unknown;
	};
	return candidate.$$typeof === EXACT_COMPONENT_TYPE &&
		typeof candidate.exactComponent === 'function'
		? {
				component: candidate.exactComponent as AnyComponentFunction,
				...(typeof candidate.exactRefProp === 'string' || typeof candidate.exactRefProp === 'symbol'
					? { refProp: candidate.exactRefProp }
					: {})
			}
		: undefined;
}
/** Runs react type with the supplied execution context. */
export function invokeReactType(
	type: AnyReactComponentType | symbol,
	props: Record<string, unknown>,
	ref?: unknown
): ReactNode {
	// Native providers carry React-owned children through a fragment island.
	if (type === REACT_FRAGMENT_TYPE) return props.children as ReactNode;
	if (typeof type === 'function') {
		if (isReactClassType(type)) throw new Error('React class component adapter invariant failed');
		if (reactCompatibilityTarget() === 19 && ref !== undefined) props.ref = ref;
		return (type as (props: Record<string, unknown>) => ReactNode)(props);
	}
	const special = type as ReactSpecialType;
	if (special.$$typeof === REACT_FORWARD_REF_TYPE && special.render)
		return special.render(props, ref ?? null);
	if (special.$$typeof === REACT_MEMO_TYPE && special.type)
		return invokeReactType(special.type, props, ref);
	if (special.$$typeof === REACT_LAZY_TYPE && special._init) {
		return invokeReactType(special._init(special._payload) as AnyReactComponentType, props, ref);
	}
	if (
		special.$$typeof === REACT_PROVIDER_TYPE ||
		(special.$$typeof === REACT_CONTEXT_TYPE && 'value' in props)
	) {
		const context = contextForSpecial(special);
		activeHookHost().provide(context, props.value);
		return props.children as ReactNode;
	}
	if (special.$$typeof === REACT_CONSUMER_TYPE || special.$$typeof === REACT_CONTEXT_TYPE) {
		const context = contextForSpecial(special);
		if (typeof props.children !== 'function')
			throw new TypeError('A React context consumer requires a function child');
		return (props.children as (value: unknown) => ReactNode)(activeHookHost().context(context));
	}
	throw unsupportedType(reactTypeName(type));
}
/** Reports whether react portal. */
export function isReactPortal(value: unknown): value is import('../types.js').ReactPortal {
	return (
		!!value &&
		typeof value === 'object' &&
		(
			value as {
				$$typeof?: unknown;
			}
		).$$typeof === REACT_PORTAL_TYPE
	);
}

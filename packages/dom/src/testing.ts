import { type AnyComponentInstance, unwrap, type VNode } from '@exactjs/core';
import { elementOwners, roots } from './state.js';
import type { Mounted } from './types.js';
import type { ExactRenderProgram } from '@exactjs/core/runtime/render';
import { createGenericRenderProgramBinder } from './renderer/render-program-generic-bindings.js';

/** Adds the table-driven binder used by manually constructed render programs in tests. */
export function withGenericRenderProgramBindings(program: ExactRenderProgram): ExactRenderProgram {
	if (program.directClaims || !program.template) return program;
	const bindings = program.bindings ?? [];
	if (bindings.length === 0) return program;
	return {
		...program,
		bind: createGenericRenderProgramBinder(bindings),
		...(bindings.some((binding) => binding[0] === 'lists') ? { listBindings: true } : {})
	};
}

/** Defines the dom inspection node type contract. */
export type DomInspectionNode = {
	readonly vnode: Readonly<Pick<VNode, 'type' | 'key'>>;
	readonly instance?: AnyComponentInstance;
	readonly parent?: DomInspectionNode;
	readonly children: readonly DomInspectionNode[];
	readonly activity?: Readonly<{
		mode: NonNullable<Mounted['activity']>['mode'];
		detached: boolean;
		pending: number;
		generation: number;
	}>;
	readonly suspense?: Readonly<{
		pending: number;
		generation: number;
		revealed: boolean;
		hasCandidate: boolean;
	}>;
	readonly target?: Readonly<{
		selected?: Element;
		contributions: readonly Readonly<{
			owner?: AnyComponentInstance;
			props: Readonly<Record<string, unknown>>;
		}>[];
		effectiveProps?: Readonly<Record<string, unknown>>;
	}>;
	elements(): readonly Element[];
	ownedElements(): readonly Element[];
};

/** Returns a read-only snapshot of the renderer-owned tree for tooling and tests. */
export function inspectDomRoot(container: Element): DomInspectionNode | undefined {
	const mounted = roots.get(container)?.mounted;
	return mounted ? inspectMounted(mounted, undefined) : undefined;
}

/** Resolves an element owner. */
export function findElementOwner(element: Element): AnyComponentInstance | undefined {
	return elementOwners.get(element);
}

function inspectMounted(
	mounted: Mounted,
	parent: DomInspectionNode | undefined
): DomInspectionNode {
	let children: readonly DomInspectionNode[] = [];
	const elements = Object.freeze(rootElements(mounted));
	const owned = Object.freeze(
		mounted.instance
			? allElements(mounted).filter((element) => elementOwners.get(element) === mounted.instance)
			: []
	);
	const node: DomInspectionNode = {
		vnode: Object.freeze({ type: mounted.vnode.type, key: mounted.vnode.key }),
		instance: mounted.instance,
		parent,
		activity: mounted.activity
			? Object.freeze({
					mode: mounted.activity.mode,
					detached: mounted.activity.retained?.detached ?? false,
					pending: mounted.activity.readiness.pending,
					generation: mounted.activity.readiness.generation
				})
			: undefined,
		suspense: mounted.suspense
			? Object.freeze({
					pending: mounted.suspense.coordinator.pending,
					generation: mounted.suspense.coordinator.generation,
					revealed: mounted.suspense.revealed,
					hasCandidate: mounted.suspense.candidate !== undefined
				})
			: undefined,
		target:
			mounted.targetBoundary || mounted.targetContributions?.size
				? Object.freeze({
						selected:
							mounted.targetBoundary?.selected?.dom instanceof Element
								? mounted.targetBoundary.selected.dom
								: undefined,
						contributions: Object.freeze(
							[...(mounted.targetContributions?.values() ?? [])].map((contribution) =>
								Object.freeze({
									owner: contribution.owner,
									props: snapshotProps(contribution.props)
								})
							)
						),
						effectiveProps: mounted.targetEffectiveProps
							? snapshotProps(mounted.targetEffectiveProps)
							: undefined
					})
				: undefined,
		get children() {
			return children;
		},
		elements: () => elements,
		ownedElements: () => owned
	};
	children = Object.freeze(mounted.children.map((child) => inspectMounted(child, node)));
	return Object.freeze(node);
}

function snapshotProps(
	props: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
	return Object.freeze(
		Object.fromEntries(
			Object.entries(props)
				.filter(([key]) => key !== 'children')
				.map(([key, value]) => [key, unwrap(value)])
		)
	);
}

function rootElements(mounted: Mounted): Element[] {
	if (isElementNode(mounted.dom)) return [mounted.dom];
	return mounted.children.flatMap(rootElements);
}

function allElements(mounted: Mounted): Element[] {
	const output = isElementNode(mounted.dom) ? [mounted.dom] : [];
	for (const child of mounted.children) output.push(...allElements(child));
	return output;
}

function isElementNode(node: Node): node is Element {
	return node.nodeType === 1;
}

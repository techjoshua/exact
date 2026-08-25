import { type AnyComponentInstance, unwrap, type VNode } from '@exactjs/core';
import { elementOwners, roots } from './state.js';
import type { Mounted } from './types.js';
import type { ExactRenderProgram } from '@exactjs/core/runtime/render';
import { createGenericRenderProgramBinder } from './renderer/render-program-generic-bindings.js';
import {
	claimGenericHydrationSlots,
	claimGenericMountSlots
} from './renderer/render-program-slot-claims.js';
import { indexProgramHydration, programElement } from './renderer/render-program-hydration.js';
import type { ExactTableRenderProgram } from '@exactjs/core/runtime/render';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render';

/** Converts a manually constructed table fixture into the direct client ABI used in production. */
export function withGenericRenderProgramBindings(program: ExactRenderProgram): ExactRenderProgram {
	if (program.directClaims || !program.template) return program;
	const table = program as ExactTableRenderProgram;
	const bindings = program.bindings ?? [];
	const directBase = {
		version: program.version,
		id: program.id,
		namespace: program.namespace,
		template: program.template,
		...(program.listBindings ? { listBindings: true as const } : {}),
		...(program.keyedChildren === undefined ? {} : { keyedChildren: program.keyedChildren }),
		...(program.ssr ? { ssr: program.ssr } : {})
	};
	if (program.nodes.length === 1 && program.slots.length === 0)
		return {
			...directBase,
			directClaims: true,
			root: [program.nodes[0]![1], program.nodes[0]![2]],
			work: [1, 0]
		};
	const bindGeneric = createGenericRenderProgramBinder(bindings, program.slots);
	return {
		...directBase,
		directClaims: true,
		bind(target) {
			if (isTestClaimTarget(target)) claimTableFixture(target, table);
			else bindGeneric(target);
		},
		...(bindings.some((binding) => binding[0] === 'lists') ? { listBindings: true } : {})
	};
}

type TestClaimTarget = ExactRenderProgramBindingTarget & {
	readonly claiming: true;
	readonly root: Element;
	readonly source: 'template' | 'ssr';
	readonly elements: Array<Element | undefined>;
	readonly slotNodes: Array<Node | undefined>;
	componentSlots: number | Set<number>;
	work: readonly [number, number];
	valid: boolean;
	began: boolean;
};

function isTestClaimTarget(target: ExactRenderProgramBindingTarget): target is TestClaimTarget {
	return (target as { claiming?: boolean }).claiming === true;
}

function claimTableFixture(target: TestClaimTarget, program: ExactTableRenderProgram): void {
	const index = indexProgramHydration(target.root);
	target.elements.splice(
		0,
		target.elements.length,
		...program.nodes.map((node) => programElement(index, node[0]))
	);
	const slots =
		target.source === 'ssr'
			? claimGenericHydrationSlots(program, target.root, index)
			: claimGenericMountSlots(program, target.root, index);
	target.slotNodes.splice(0, target.slotNodes.length, ...slots);
	const components = program.slots.flatMap((slot, index) =>
		slot[0] === 'component' ? [index] : []
	);
	target.componentSlots = components.every((index) => index < 31)
		? components.reduce((mask, index) => mask | (1 << index), 0)
		: new Set(components);
	target.work = [program.nodes.length, program.slots.length];
	target.began = true;
	target.valid =
		program.nodes.every((node, index) =>
			matchesFixtureElement(target.elements[index], node, program.namespace)
		) && target.slotNodes.every((node) => node instanceof Node || Array.isArray(node));
}

function matchesFixtureElement(
	element: Element | undefined,
	plan: ExactTableRenderProgram['nodes'][number],
	programNamespace: ExactTableRenderProgram['namespace']
): boolean {
	if (!element || element.localName.toLowerCase() !== plan[1].toLowerCase()) return false;
	const namespace = plan[2] ?? programNamespace;
	const uri =
		namespace === 'svg'
			? 'http://www.w3.org/2000/svg'
			: namespace === 'mathml'
				? 'http://www.w3.org/1998/Math/MathML'
				: 'http://www.w3.org/1999/xhtml';
	return element.namespaceURI === uri;
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

import {
	inspectExactRuntimeComponent,
	unwrap,
	type ComponentInstance,
	type ExactRuntimeInspectionOwner
} from '@exactjs/core';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
import { readExactPartitionDiscriminator } from './framework/hydration.js';
import type {
	ExactInspectedRuntimeComponent,
	ExactInspectedPartitionInstance,
	ExactInspectionExecutionRoot,
	ExactInspectionRuntimeId,
	ExactRuntimeInspectionSink
} from '@exactjs/devtools-protocol';
import { activeInspectableRoots, elementOwners } from './state.js';
import { findNodeOwnerInstance } from './ownership.js';
import { walkDomSubtree } from './work.js';
import type { Mounted, Root } from './types.js';

/** Current client-side projection consumed by the page-world bridge. */
export type ExactDomInspectionSnapshot = Readonly<{
	roots: readonly ExactInspectionExecutionRoot[];
	components: readonly ExactInspectedRuntimeComponent[];
	partitions: readonly ExactInspectedPartitionInstance[];
}>;

/** Production-safe renderer inspection surface that never returns component instances. */
export interface ExactDomInspectionHost {
	attach(sessionId: string, sink: ExactRuntimeInspectionSink): void;
	detach(sessionId?: string): void;
	snapshot(): ExactDomInspectionSnapshot;
	ownerOfElement(element: Element): ExactInspectionRuntimeId | undefined;
	ownedElements(identity: ExactInspectionRuntimeId): readonly Element[];
}

/** Creates a late-attachment host over the renderer's explicitly maintained active-root registry. */
export function createExactDomInspectionHost(): ExactDomInspectionHost {
	const attachedOwners = new Set<ExactRuntimeInspectionOwner>();
	const host: ExactDomInspectionHost = {
		attach(sessionId, sink) {
			for (const root of activeInspectableRoots()) {
				const owner = root.current.domain
					? componentDomainInspection(root.current.domain)
					: undefined;
				if (!owner) continue;
				owner.attach(sessionId, sink);
				attachedOwners.add(owner);
			}
		},
		detach(sessionId) {
			for (const owner of attachedOwners) owner.detach(sessionId);
			attachedOwners.clear();
		},
		snapshot() {
			return snapshotRoots(activeInspectableRoots());
		},
		ownerOfElement(element) {
			const instance = elementOwners.get(element);
			return instance ? componentDomainInspection(instance.domain)?.identity(instance) : undefined;
		},
		ownedElements(identity) {
			for (const root of activeInspectableRoots()) {
				const mounted = root.mounted;
				if (!mounted) continue;
				const found = findMountedInstance(mounted, identity);
				if (found) return Object.freeze(ownedElements(found));
			}
			return Object.freeze([]);
		}
	};
	return Object.freeze(host);
}

function snapshotRoots(roots: readonly Root[]): ExactDomInspectionSnapshot {
	const executionRoots: ExactInspectionExecutionRoot[] = [];
	const components: ExactInspectedRuntimeComponent[] = [];
	const partitions: ExactInspectedPartitionInstance[] = [];
	for (const root of roots) {
		const owner = root.current.domain ? componentDomainInspection(root.current.domain) : undefined;
		if (!owner || !root.mounted) continue;
		const before = components.length;
		appendMounted(root.mounted, undefined, components);
		executionRoots.push(
			Object.freeze({
				side: owner.side,
				...(owner.binding ? { binding: owner.binding } : {}),
				buildKey: owner.buildKey,
				executionRoot: owner.executionRoot,
				status: 'available',
				components: components.length - before
			})
		);
		partitions.push(...partitionRoots(root, owner.buildKey, owner.executionRoot));
	}
	return Object.freeze({
		roots: Object.freeze(executionRoots),
		components: Object.freeze(components),
		partitions: Object.freeze(partitions)
	});
}

type MutablePartitionInspection = {
	value: Omit<ExactInspectedPartitionInstance, 'children'>;
	children: MutablePartitionInspection[];
};

function partitionRoots(
	root: Root,
	buildKey: string,
	executionRoot: string
): readonly ExactInspectedPartitionInstance[] {
	const byElement = new Map<Element, MutablePartitionInspection>();
	const roots: MutablePartitionInspection[] = [];
	walkDomSubtree(
		root.container,
		(node) => {
			if (!(node instanceof Element) || !node.hasAttribute('data-exact-partition-edge')) return;
			const markerBuild = node.getAttribute('data-exact-partition-build');
			const markerRoot = node.getAttribute('data-exact-partition-root');
			const plan = node.getAttribute('data-exact-partition-edge');
			const ownerComponentId = node.getAttribute('data-exact-partition-owner');
			const generation = Number(node.getAttribute('data-exact-partition-generation'));
			const discriminator = readExactPartitionDiscriminator(node);
			if (
				node.getAttribute('data-exact-partition-version') !== '1' ||
				markerBuild !== buildKey ||
				markerRoot !== executionRoot ||
				!plan ||
				!ownerComponentId ||
				!discriminator ||
				!Number.isSafeInteger(generation) ||
				generation < 1
			)
				return;
			const owner = findNodeOwnerInstance(node);
			const ownerIdentity = owner
				? componentDomainInspection(owner.domain)?.identity(owner)
				: undefined;
			const mutable: MutablePartitionInspection = {
				value: Object.freeze({
					executionRoot,
					buildKey,
					plan,
					ownerComponentId,
					...(ownerIdentity ? { ownerComponentInstance: ownerIdentity } : {}),
					discriminator,
					generation,
					host: 'server' as const
				}),
				children: []
			};
			byElement.set(node, mutable);
			const parentElement = node.parentElement?.closest('[data-exact-partition-edge]');
			const parent = parentElement ? byElement.get(parentElement) : undefined;
			if (parent) parent.children.push(mutable);
			else roots.push(mutable);
		},
		{ maxNodes: root.maxTreeNodes }
	);
	return Object.freeze(roots.map(freezePartitionInspection));
}

function freezePartitionInspection(
	instance: MutablePartitionInspection
): ExactInspectedPartitionInstance {
	return Object.freeze({
		...instance.value,
		children: Object.freeze(instance.children.map(freezePartitionInspection))
	});
}

function appendMounted(
	mounted: Mounted,
	parent: ExactInspectionRuntimeId | undefined,
	output: ExactInspectedRuntimeComponent[]
): void {
	const instance = mounted.instance;
	const identity = instance
		? componentDomainInspection(instance.domain)?.identity(instance)
		: undefined;
	const nextParent = identity ?? parent;
	if (instance && identity) {
		const snapshot = inspectExactRuntimeComponent(instance, {
			parent,
			ownedElements: ownedElements(mounted).length,
			...(mounted.activity
				? {
						activity: Object.freeze({
							mode: mounted.activity.mode,
							detached: mounted.activity.retained?.detached ?? false,
							pending: mounted.activity.readiness.pending,
							generation: mounted.activity.readiness.generation
						})
					}
				: {}),
			...(mounted.suspense
				? {
						suspense: Object.freeze({
							pending: mounted.suspense.coordinator.pending,
							generation: mounted.suspense.coordinator.generation,
							revealed: mounted.suspense.revealed,
							hasCandidate: mounted.suspense.candidate !== undefined
						})
					}
				: {}),
			targetContributions: inspectTargetContributions(mounted, instance)
		});
		if (snapshot) output.push(snapshot);
	}
	for (const child of mounted.children) appendMounted(child, nextParent, output);
}

function inspectTargetContributions(
	mounted: Mounted,
	owner: ComponentInstance<any>
): NonNullable<ExactInspectedRuntimeComponent['targetContributions']> {
	const inspection = componentDomainInspection(owner.domain);
	if (!inspection) return Object.freeze([]);
	const contributions: NonNullable<
		ExactInspectedRuntimeComponent['targetContributions']
	>[number][] = [];
	visitOwnedTargetBoundaries(mounted, owner, (boundary) => {
		const selected = boundary.targetBoundary?.selected;
		const element = selected?.dom instanceof Element ? selected.dom : undefined;
		const effective = selected?.targetEffectiveProps;
		contributions.push(
			Object.freeze({
				active: !!element,
				...(element
					? {
							target: Object.freeze({
								tagName: element.tagName.toLowerCase(),
								connected: element.isConnected
							})
						}
					: {}),
				props: inspection.preview(snapshotTargetProps(boundary.vnode.props), [
					'targetContributions',
					'props'
				]),
				...(effective
					? {
							effectiveProps: inspection.preview(snapshotTargetProps(effective), [
								'targetContributions',
								'effectiveProps'
							])
						}
					: {})
			})
		);
	});
	return Object.freeze(contributions);
}

function visitOwnedTargetBoundaries(
	mounted: Mounted,
	owner: ComponentInstance<any>,
	visit: (boundary: Mounted) => void
): void {
	for (const child of mounted.children) {
		if (child.instance && child.instance !== owner) continue;
		if (child.targetBoundary?.owner === owner) visit(child);
		visitOwnedTargetBoundaries(child, owner, visit);
	}
}

function snapshotTargetProps(
	props: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
	return Object.freeze(
		Object.fromEntries(
			Object.entries(props)
				.filter(([key]) => key !== 'children' && key !== 'ref' && !/^on[A-Z]/.test(key))
				.map(([key, value]) => [key, unwrap(value)])
		)
	);
}

function findMountedInstance(
	mounted: Mounted,
	identity: ExactInspectionRuntimeId
): Mounted | undefined {
	const instance = mounted.instance;
	if (
		instance &&
		instance.id === identity.instanceId &&
		instance.domain.executionRoot === identity.executionRoot
	)
		return mounted;
	for (const child of mounted.children) {
		const found = findMountedInstance(child, identity);
		if (found) return found;
	}
	return undefined;
}

function ownedElements(mounted: Mounted): Element[] {
	const owner = mounted.instance;
	if (!owner) return [];
	const output: Element[] = [];
	visitMounted(mounted, (element) => {
		if (elementOwners.get(element) === owner) output.push(element);
	});
	return output;
}

function visitMounted(mounted: Mounted, visit: (element: Element) => void): void {
	if (mounted.dom.nodeType === 1) visit(mounted.dom as Element);
	for (const child of mounted.children) visitMounted(child, visit);
}

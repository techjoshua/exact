import { inspectExactRuntimeComponent, type ExactRuntimeInspectionOwner } from '@exactjs/core';
import type {
	ExactInspectedRuntimeComponent,
	ExactInspectionExecutionRoot,
	ExactInspectionRuntimeId,
	ExactRuntimeInspectionSink
} from '@exactjs/devtools-protocol';
import { activeInspectableRoots, elementOwners } from './state.js';
import type { Mounted, Root } from './types.js';

/** Current client-side projection consumed by the page-world bridge. */
export type ExactDomInspectionSnapshot = Readonly<{
	roots: readonly ExactInspectionExecutionRoot[];
	components: readonly ExactInspectedRuntimeComponent[];
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
				const owner = root.current.domain?.inspection;
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
			return instance?.domain.inspection?.identity(instance);
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
	for (const root of roots) {
		const owner = root.current.domain?.inspection;
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
	}
	return Object.freeze({
		roots: Object.freeze(executionRoots),
		components: Object.freeze(components)
	});
}

function appendMounted(
	mounted: Mounted,
	parent: ExactInspectionRuntimeId | undefined,
	output: ExactInspectedRuntimeComponent[]
): void {
	const instance = mounted.instance;
	const identity = instance?.domain.inspection?.identity(instance);
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
				: {})
		});
		if (snapshot) output.push(snapshot);
	}
	for (const child of mounted.children) appendMounted(child, nextParent, output);
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

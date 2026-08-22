import { findNodeOwnerInstance, walkDomSubtree } from '@exactjs/dom/root';
import { readExactPartitionDiscriminator } from '@exactjs/dom/framework/hydration';
import type { ExactPartitionInstance } from './types.js';

type MutablePartitionInstance = {
	value: Omit<ExactPartitionInstance, 'children'>;
	children: MutablePartitionInstance[];
};

/** Reconstructs the bounded live partition-instance tree from authoritative range markers. */
export function inspectExactPartitionInstances(
	container: Element,
	options: Readonly<{
		executionRoot?: string;
		buildKey?: string;
		maxTreeNodes?: number;
	}> = {}
): readonly ExactPartitionInstance[] {
	const executionRoot = options.executionRoot ?? 'page';
	const byElement = new Map<Element, MutablePartitionInstance>();
	const roots: MutablePartitionInstance[] = [];
	walkDomSubtree(
		container,
		(node) => {
			if (!(node instanceof Element) || !node.hasAttribute('data-exact-partition-edge')) return;
			const instance = partitionInstance(node, executionRoot, options.buildKey);
			if (!instance) return;
			const mutable = { value: instance, children: [] };
			byElement.set(node, mutable);
			const parentElement = node.parentElement?.closest('[data-exact-partition-edge]');
			const parent = parentElement && byElement.get(parentElement);
			if (parent) parent.children.push(mutable);
			else roots.push(mutable);
		},
		options.maxTreeNodes === undefined ? undefined : { maxNodes: options.maxTreeNodes }
	);
	return Object.freeze(roots.map(freezePartitionInstance));
}

function partitionInstance(
	marker: Element,
	executionRoot: string,
	buildKey: string | undefined
): Omit<ExactPartitionInstance, 'children'> | undefined {
	const markerRoot = marker.getAttribute('data-exact-partition-root');
	const markerBuild = marker.getAttribute('data-exact-partition-build');
	const plan = marker.getAttribute('data-exact-partition-edge');
	const ownerComponentId = marker.getAttribute('data-exact-partition-owner');
	const generation = Number(marker.getAttribute('data-exact-partition-generation'));
	const discriminator = readExactPartitionDiscriminator(marker);
	if (
		marker.getAttribute('data-exact-partition-version') !== '1' ||
		markerRoot !== executionRoot ||
		!markerBuild ||
		(buildKey !== undefined && markerBuild !== buildKey) ||
		!plan ||
		!ownerComponentId ||
		!discriminator ||
		!Number.isSafeInteger(generation) ||
		generation < 1
	)
		return undefined;
	const owner = findNodeOwnerInstance(marker);
	return Object.freeze({
		executionRoot,
		buildKey: markerBuild,
		plan,
		ownerComponentId,
		ownerComponentInstance: owner?.id ?? ownerComponentId,
		discriminator,
		generation,
		host: 'server' as const
	});
}

function freezePartitionInstance(instance: MutablePartitionInstance): ExactPartitionInstance {
	return Object.freeze({
		...instance.value,
		children: Object.freeze(instance.children.map(freezePartitionInstance))
	});
}

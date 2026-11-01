import { findNodeOwnerInstance, walkDomSubtree } from '@exactjs/dom/root';
import { readExactPartitionDiscriminator } from '@exactjs/dom/framework/hydration';
import type { ExactPartitionInstance } from './types.js';

type MutablePartitionInstance = Omit<ExactPartitionInstance, 'children'> & {
	children: MutablePartitionInstance[];
};

/** Builds an ordinary detached partition tree in DOM order, validating the live range markers. */
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
			byElement.set(node, instance);
			const parentElement = node.parentElement?.closest('[data-exact-partition-edge]');
			const parent = parentElement && byElement.get(parentElement);
			if (parent) parent.children.push(instance);
			else roots.push(instance);
		},
		options.maxTreeNodes === undefined ? undefined : { maxNodes: options.maxTreeNodes }
	);
	return roots;
}

/** Copies a marker whose root, build, identity and generation pass the inspection filters. */
function partitionInstance(
	marker: Element,
	executionRoot: string,
	buildKey: string | undefined
): MutablePartitionInstance | undefined {
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
	return {
		executionRoot,
		buildKey: markerBuild,
		plan,
		ownerComponentId,
		ownerComponentInstance: owner?.id ?? ownerComponentId,
		discriminator,
		generation,
		host: 'server',
		children: []
	};
}

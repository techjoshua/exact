import type {
	ExactInspectedPartitionInstance,
	ExactRuntimePartitionPlan
} from '@exactjs/devtools-protocol';
import { createTreeDisclosure, setTreeBranchExpanded } from './tree-disclosure.js';

/** Renders the live partition-range section shown beside the component tree. */
export function renderPartitionTree(
	instances: readonly ExactInspectedPartitionInstance[],
	plans: readonly ExactRuntimePartitionPlan[] = []
): readonly HTMLElement[] {
	const heading = element('div', 'section-heading');
	const title = element('h2');
	title.textContent = 'Partition instances';
	const count = element('span');
	count.textContent = `${partitionCount(instances)} ranges`;
	heading.append(title, count);
	const tree = element('div', 'component-tree');
	for (let index = 0; index < instances.length; index++)
		tree.append(renderPartitionNode(instances[index]!, String(index), plans));
	if (!instances.length) {
		const empty = element('div', 'empty-state');
		const emptyTitle = element('strong');
		emptyTitle.textContent = 'No live partition ranges';
		const description = element('p');
		description.textContent = 'This root has no retained host crossings.';
		empty.append(emptyTitle, description);
		tree.append(empty);
	}
	return [heading, tree];
}

function renderPartitionNode(
	instance: ExactInspectedPartitionInstance,
	path: string,
	plans: readonly ExactRuntimePartitionPlan[]
): HTMLElement {
	const branch = element('div', 'tree-branch');
	const row = element('div', 'tree-node');
	row.classList.add('tree-row');
	const status = element('span', 'status-dot status-mounted');
	const name = element('span', 'tree-name');
	name.textContent = `${instance.host} range`;
	const decision = activationDecision(instance, plans);
	row.title = [instance.plan, instance.ownerComponentId, ...decision.reasons].join(' · ');
	if (instance.children.length) {
		branch.setAttribute('data-panel-collapse-key', `partition:${path}`);
		row.append(createTreeDisclosure(branch, `${instance.host} range`));
	} else row.append(element('span', 'tree-disclosure-placeholder'));
	row.append(status, name, partitionBadge(instance.discriminator.kind, 'neutral'));
	if (decision.mode)
		row.append(partitionBadge(decision.mode, decision.mode === 'eager' ? 'busy' : 'neutral'));
	if (instance.generation > 1) row.append(partitionBadge(`g${instance.generation}`, 'busy'));
	branch.append(row);
	if (instance.children.length) {
		const children = element('div', 'tree-children');
		for (let index = 0; index < instance.children.length; index++)
			children.append(renderPartitionNode(instance.children[index]!, `${path}.${index}`, plans));
		branch.append(children);
		setTreeBranchExpanded(branch, true);
	}
	return branch;
}

function activationDecision(
	instance: ExactInspectedPartitionInstance,
	plans: readonly ExactRuntimePartitionPlan[]
): { mode?: string; reasons: string[] } {
	const plan = plans.find((candidate) => candidate.buildKey === instance.buildKey);
	const edge = plan?.edges.find((candidate) => candidate.id === instance.plan);
	const child = edge && typeof edge.child === 'string' ? edge.child : undefined;
	const node = plan?.nodes.find((candidate) => candidate.id === child);
	if (!node || typeof node.activation !== 'string') return { reasons: [] };
	const details = node.activationDecision;
	const reasonValues =
		typeof details === 'object' && details !== null && 'reasons' in details
			? (details as { reasons?: unknown }).reasons
			: undefined;
	const reasons = Array.isArray(reasonValues)
		? reasonValues.flatMap((reason: unknown) =>
				typeof reason === 'object' &&
				reason !== null &&
				'code' in reason &&
				typeof reason.code === 'string'
					? [reason.code]
					: []
			)
		: [];
	return { mode: node.activation, reasons };
}

function partitionCount(instances: readonly ExactInspectedPartitionInstance[]): number {
	let count = 0;
	const pending = [...instances];
	while (pending.length) {
		const instance = pending.pop()!;
		count++;
		pending.push(...instance.children);
	}
	return count;
}

function partitionBadge(text: string, tone: string): HTMLElement {
	const result = element('span', `badge badge-${tone}`);
	result.textContent = text;
	return result;
}

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string
): HTMLElementTagNameMap[K] {
	const result = document.createElement(tag);
	if (className) result.className = className;
	return result;
}

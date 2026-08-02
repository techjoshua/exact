import type { ExactInspectedPartitionInstance } from '@exactjs/devtools-protocol';

/** Renders the live partition-range section shown beside the component tree. */
export function renderPartitionTree(
	instances: readonly ExactInspectedPartitionInstance[]
): readonly HTMLElement[] {
	const heading = element('div', 'section-heading');
	const title = element('h2');
	title.textContent = 'Partition instances';
	const count = element('span');
	count.textContent = `${partitionCount(instances)} ranges`;
	heading.append(title, count);
	const tree = element('div', 'component-tree');
	for (const instance of instances) tree.append(renderPartitionNode(instance));
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

function renderPartitionNode(instance: ExactInspectedPartitionInstance): HTMLElement {
	const branch = element('div', 'tree-branch');
	const row = element('div', 'tree-node');
	const disclosure = element('span', 'tree-disclosure');
	disclosure.textContent = instance.children.length ? '▾' : '';
	const status = element('span', 'status-dot status-mounted');
	const name = element('span', 'tree-name');
	name.textContent = `${instance.host} range`;
	row.title = `${instance.plan} · ${instance.ownerComponentId}`;
	row.append(disclosure, status, name, partitionBadge(instance.discriminator.kind, 'neutral'));
	if (instance.generation > 1) row.append(partitionBadge(`g${instance.generation}`, 'busy'));
	branch.append(row);
	if (instance.children.length) {
		const children = element('div', 'tree-children');
		for (const child of instance.children) children.append(renderPartitionNode(child));
		branch.append(children);
	}
	return branch;
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

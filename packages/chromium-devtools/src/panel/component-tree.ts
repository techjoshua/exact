import type { ExactInspectionRuntimeId } from '@exactjs/devtools-protocol';
import { createTreeDisclosure, setTreeBranchExpanded } from './tree-disclosure.js';
import { exactPanelIdentityKey, type ExactComponentTreeNode } from './view-model.js';

/** Renders one selectable component branch with disclosure independent from selection. */
export function renderComponentTreeNode(
	treeNode: ExactComponentTreeNode,
	selectedKey: string | undefined,
	selectComponent: (id: ExactInspectionRuntimeId) => void
): HTMLElement {
	const branch = element('div', 'tree-branch');
	const component = treeNode.component;
	const row = element('div', 'tree-row');
	const button = element('button', 'tree-node');
	button.type = 'button';
	button.classList.toggle('selected', exactPanelIdentityKey(component.id) === selectedKey);
	button.title = `${component.name} · ${component.id.instanceId ?? 'runtime instance'}`;
	const status = element('span', `status-dot status-${component.status}`);
	const name = element('span', 'tree-name');
	name.textContent = component.name;
	button.append(status, name);
	if (component.id.instanceId)
		button.append(treeBadge(shortIdentity(component.id.instanceId), 'neutral'));
	if (component.tasks.some((task) => task.status === 'running' || task.status === 'queued'))
		button.append(treeBadge('working', 'busy'));
	button.addEventListener('click', () => selectComponent(component.id));
	if (treeNode.children.length) {
		branch.setAttribute('data-panel-collapse-key', exactPanelIdentityKey(component.id));
		row.append(createTreeDisclosure(branch, component.name));
	} else row.append(element('span', 'tree-disclosure-placeholder'));
	row.append(button);
	branch.append(row);
	if (treeNode.children.length) {
		const children = element('div', 'tree-children');
		for (const child of treeNode.children)
			children.append(renderComponentTreeNode(child, selectedKey, selectComponent));
		branch.append(children);
		setTreeBranchExpanded(branch, true);
	}
	return branch;
}

function treeBadge(text: string, tone: string): HTMLElement {
	const result = element('span', `badge badge-${tone}`);
	result.textContent = text;
	return result;
}

function shortIdentity(value: string): string {
	return value.length > 16 ? `${value.slice(0, 12)}…` : value;
}

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string
): HTMLElementTagNameMap[K] {
	const result = document.createElement(tag);
	if (className) result.className = className;
	return result;
}

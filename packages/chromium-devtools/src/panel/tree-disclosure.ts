/** Creates an independent branch disclosure control without changing row selection behavior. */
export function createTreeDisclosure(branch: HTMLElement, label: string): HTMLButtonElement {
	const toggle = document.createElement('button');
	toggle.className = 'tree-disclosure';
	toggle.type = 'button';
	toggle.setAttribute('data-tree-disclosure', '');
	toggle.setAttribute('aria-label', `Collapse ${label}`);
	toggle.addEventListener('click', () =>
		setTreeBranchExpanded(branch, branch.dataset.panelExpanded !== 'true')
	);
	return toggle;
}

/** Applies branch visibility and accessible disclosure state. */
export function setTreeBranchExpanded(branch: HTMLElement, expanded: boolean): void {
	branch.dataset.panelExpanded = String(expanded);
	const toggle = branch.querySelector<HTMLButtonElement>(
		':scope > .tree-row > [data-tree-disclosure]'
	);
	const children = branch.querySelector<HTMLElement>(':scope > .tree-children');
	if (toggle) {
		toggle.textContent = expanded ? '▾' : '▸';
		toggle.setAttribute('aria-expanded', String(expanded));
		const label =
			toggle.getAttribute('aria-label')?.replace(/^(?:Collapse|Expand) /, '') ?? 'branch';
		toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${label}`);
	}
	if (children) children.hidden = !expanded;
}

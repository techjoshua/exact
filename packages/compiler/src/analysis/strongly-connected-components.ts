/**
 * Orders graph nodes by strongly connected component, with dependencies before consumers.
 *
 * Nodes and edges are sorted before traversal so emitted compiler manifests remain stable
 * when source discovery order changes.
 */
export function orderStronglyConnectedComponents<T>(
	nodes: readonly T[],
	idFor: (node: T) => string,
	dependenciesFor: (node: T) => readonly string[]
): T[][] {
	const byId = new Map(nodes.map((node) => [idFor(node), node]));
	const indices = new Map<string, number>();
	const lowLinks = new Map<string, number>();
	const stack: T[] = [];
	const onStack = new Set<string>();
	const components: T[][] = [];
	let nextIndex = 0;

	const visit = (node: T) => {
		const id = idFor(node);
		indices.set(id, nextIndex);
		lowLinks.set(id, nextIndex++);
		stack.push(node);
		onStack.add(id);

		const dependencies = [
			...new Set(dependenciesFor(node).filter((target) => byId.has(target)))
		].sort();
		for (const dependencyId of dependencies) {
			const dependency = byId.get(dependencyId)!;
			if (!indices.has(dependencyId)) {
				visit(dependency);
				lowLinks.set(id, Math.min(lowLinks.get(id)!, lowLinks.get(dependencyId)!));
			} else if (onStack.has(dependencyId)) {
				lowLinks.set(id, Math.min(lowLinks.get(id)!, indices.get(dependencyId)!));
			}
		}

		if (lowLinks.get(id) !== indices.get(id)) return;
		const component: T[] = [];
		let member: T;
		do {
			member = stack.pop()!;
			onStack.delete(idFor(member));
			component.push(member);
		} while (member !== node);
		components.push(component.sort((left, right) => idFor(left).localeCompare(idFor(right))));
	};

	for (const node of [...nodes].sort((left, right) => idFor(left).localeCompare(idFor(right)))) {
		if (!indices.has(idFor(node))) visit(node);
	}

	const componentByNode = new Map<string, number>();
	components.forEach((component, index) =>
		component.forEach((node) => componentByNode.set(idFor(node), index))
	);
	const ordered: T[][] = [];
	const visited = new Set<number>();
	const appendDependenciesFirst = (index: number) => {
		if (visited.has(index)) return;
		visited.add(index);
		const dependencies = new Set<number>();
		for (const node of components[index]!) {
			for (const dependencyId of dependenciesFor(node)) {
				const dependency = componentByNode.get(dependencyId);
				if (dependency !== undefined && dependency !== index) dependencies.add(dependency);
			}
		}
		for (const dependency of [...dependencies].sort((left, right) => left - right)) {
			appendDependenciesFirst(dependency);
		}
		ordered.push(components[index]!);
	};
	for (const index of components.keys()) appendDependenciesFirst(index);
	return ordered;
}

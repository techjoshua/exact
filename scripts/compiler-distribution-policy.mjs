/**
 * Finds a retired compiler dependency path through production and optional edges.
 * Config preparation may use only its documented, exactly pinned official tool.
 * That edge does not authorize another owner, range or retired dependency route.
 */
export function retiredCompilerDependencyChain(packages, from, target, visited = new Set()) {
	if (from === target) return [from];
	if (visited.has(from)) return undefined;
	visited.add(from);
	const manifest = packages.get(from);
	if (!manifest) return undefined;
	const dependencies = {
		...(manifest.dependencies ?? {}),
		...(manifest.optionalDependencies ?? {})
	};
	for (const [dependency, spec] of Object.entries(dependencies)) {
		if (
			target === '@typescript/native' &&
			from === '@exactjs/config' &&
			dependency === '@typescript/native' &&
			spec === 'npm:typescript@7.0.2'
		)
			continue;
		const tail = retiredCompilerDependencyChain(packages, dependency, target, new Set(visited));
		if (tail) return [from, ...tail];
	}
	return undefined;
}

import { initSync, parse } from 'es-module-lexer';

/** Projects compiler-owned component edges into one queried test graph without changing other source text. */
export function projectTestTargetComponentImports(
	code: string,
	imports: readonly Readonly<{ moduleSpecifier: string }>[],
	target: 'client' | 'server' | undefined
): string {
	if (!target) return code;
	const edges = new Set(
		imports
			.map((value) => value.moduleSpecifier)
			.filter(
				(specifier) =>
					specifier.startsWith('.') &&
					!specifier.includes('?') &&
					/(?:^|\/)[^/]+\.[cm]?[jt]sx?$/iu.test(specifier.replaceAll('\\', '/'))
			)
	);
	if (!edges.size) return code;
	initSync();
	const records = parse(code)[0];
	let projected = code;
	for (const entry of [...records].sort((a, b) => b.s - a.s)) {
		if (entry.n === undefined || !edges.has(entry.n)) continue;
		// Static ranges omit their quotes. Dynamic literal ranges include them, including templates.
		const start = entry.d === -1 ? entry.s - 1 : entry.s;
		const end = entry.d === -1 ? entry.e + 1 : entry.e;
		projected =
			projected.slice(0, start) +
			JSON.stringify(`${entry.n}?exact-target=${target}`) +
			projected.slice(end);
	}
	return projected;
}

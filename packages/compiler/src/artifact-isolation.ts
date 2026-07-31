/** One final bundler output inspected at the client disclosure boundary. */
export type ExactClientArtifactOutput = Readonly<{
	fileName: string;
	type: 'chunk' | 'asset' | 'map';
	modules?: readonly string[];
	imports?: readonly string[];
	dynamicImports?: readonly string[];
	sources?: readonly string[];
}>;

/** One forbidden server contribution found in a final client artifact. */
export type ExactClientArtifactIsolationViolation = Readonly<{
	output: string;
	kind: 'file' | 'module' | 'import' | 'dynamic-import' | 'source';
	value: string;
}>;

/** Result of inspecting a final client graph without mutating bundler output. */
export type ExactClientArtifactIsolationReport = Readonly<{
	ok: boolean;
	violations: readonly ExactClientArtifactIsolationViolation[];
}>;

/**
 * Inspects final client chunks, assets, and source maps for server artifact
 * reachability. Hosts may add resolved server-only module identities discovered
 * from their own graph analysis.
 */
export function inspectExactClientArtifactIsolation(
	outputs: readonly ExactClientArtifactOutput[],
	forbiddenModules: readonly string[] = []
): ExactClientArtifactIsolationReport {
	const forbidden = new Set(forbiddenModules.map(normalizeArtifactPath));
	const violations: ExactClientArtifactIsolationViolation[] = [];
	for (const output of outputs) {
		inspectValue(output.fileName, 'file', output.fileName);
		for (const value of output.modules ?? []) inspectValue(value, 'module', output.fileName);
		for (const value of output.imports ?? []) inspectValue(value, 'import', output.fileName);
		for (const value of output.dynamicImports ?? [])
			inspectValue(value, 'dynamic-import', output.fileName);
		for (const value of output.sources ?? []) inspectValue(value, 'source', output.fileName);
	}
	return Object.freeze({
		ok: violations.length === 0,
		violations: Object.freeze(violations)
	});

	function inspectValue(
		value: string,
		kind: ExactClientArtifactIsolationViolation['kind'],
		output: string
	): void {
		const normalized = normalizeArtifactPath(value);
		if (!isServerArtifactPath(normalized) && !forbidden.has(normalized)) return;
		violations.push(Object.freeze({ output, kind, value }));
	}
}

/** Throws a deterministic build error when a final client artifact contains server reachability. */
export function assertExactClientArtifactIsolation(
	outputs: readonly ExactClientArtifactOutput[],
	forbiddenModules: readonly string[] = []
): void {
	const report = inspectExactClientArtifactIsolation(outputs, forbiddenModules);
	if (report.ok) return;
	throw new Error(
		[
			'eXact client artifact contains server-only contributions:',
			...report.violations.map(
				(violation) => `${violation.output}: ${violation.kind} ${violation.value}`
			)
		].join('\n')
	);
}

/** Normalizes host-specific path separators and cache query suffixes. */
function normalizeArtifactPath(value: string): string {
	return value.replaceAll('\\', '/').split(/[?#]/, 1)[0]!;
}

/** Recognizes compiler target artifacts independent of source extension. */
function isServerArtifactPath(value: string): boolean {
	return (
		/(?:^|\/)[^/]+\.exact\.server(?:\.|$)/i.test(value) ||
		/(?:^|\/)\.exact-inspection(?:\/|$)/i.test(value) ||
		value.includes('virtual:exact/inspection-catalog')
	);
}

/** Performs the dependency range domain operation. */
export function dependencyRange(dependencies: unknown, packageName: string): string | undefined {
	if (!isRecord(dependencies)) return undefined;
	const value = dependencies[packageName];
	return typeof value === 'string' && value.length ? value : undefined;
}

/** Validates a bare source module and its optional public subpath. */
export function assertSourceModule(specifier: string, label: string): void {
	const name = packageNameFromBareSpecifier(specifier);
	if (name === 'react' || name === 'react-dom' || name.startsWith('@exact/')) {
		throw new Error(`${label} cannot replace reserved framework package ${specifier}`);
	}
}

/** Performs the package name from bare specifier domain operation. */
export function packageNameFromBareSpecifier(specifier: string): string {
	if (!specifier || specifier.includes('\\') || /^(?:\.|\/|[a-z][a-z+.-]*:)/i.test(specifier)) {
		throw new Error(
			`Source module must be a bare package specifier; received ${JSON.stringify(specifier)}`
		);
	}
	const segments = specifier.split('/');
	const packageSegments = specifier.startsWith('@') ? segments.slice(0, 2) : segments.slice(0, 1);
	const name = packageSegments.join('/');
	assertPackageName(name, 'Source module package');
	const subpath = segments.slice(packageSegments.length);
	if (
		subpath.some(
			(segment) => !segment || segment === '.' || segment === '..' || /[?#]/.test(segment)
		)
	) {
		throw new Error(
			`Source module must be a bare package specifier; received ${JSON.stringify(specifier)}`
		);
	}
	return name;
}

/** Validates an npm package name used by adapter metadata. */
export function assertPackageName(name: string, label: string): void {
	const valid = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/i.test(
		name
	);
	if (!valid)
		throw new Error(`${label} must be a bare package name; received ${JSON.stringify(name)}`);
}

/** Validates that an adapter replacement targets a public package subpath. */
export function assertPublicSubpath(subpath: string, label: string): void {
	if (subpath === '.') return;
	if (
		!subpath.startsWith('./') ||
		subpath.length === 2 ||
		subpath.includes('\\') ||
		subpath.includes('..') ||
		/[?#]/.test(subpath)
	) {
		throw new Error(
			`${label} replacement subpath must be a public package export subpath; received ${JSON.stringify(subpath)}`
		);
	}
}

/** Validates a JavaScript export name or the default export marker. */
export function assertExportName(name: string, label: string): void {
	if (name === 'default') return;
	if (!/^[$A-Z_a-z][$\w]*$/.test(name))
		throw new Error(
			`${label} must be an explicit JavaScript export name; received ${JSON.stringify(name)}`
		);
}

/** Reads a required non-empty string field from untrusted package metadata. */
export function requiredString(value: unknown, label: string): string {
	if (typeof value !== 'string' || !value.trim())
		throw new Error(`${label} must be a non-empty string`);
	return value;
}

/** Reads an optional object field while rejecting arrays and primitive values. */
export function optionalRecord(value: unknown, label: string): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	return requiredRecord(value, label);
}

/** Reads a required object field from untrusted package metadata. */
export function requiredRecord(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`${label} must be an object`);
	return value;
}

/** Reports whether an unknown value is a non-array object record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rejects undeclared keys so misspelled adapter metadata cannot be ignored silently. */
export function assertOnlyKeys(
	value: Record<string, unknown>,
	allowed: readonly string[],
	label: string
): void {
	const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unexpected.length)
		throw new Error(
			`${label} contains unsupported ${unexpected.length === 1 ? 'field' : 'fields'}: ${unexpected.join(', ')}`
		);
}

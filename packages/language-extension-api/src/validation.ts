import type {
	ExactLanguageAnalyzerCapability,
	ExactLanguageDeclarationV1,
	ExactLanguageProjectionCapability
} from './contracts.js';

const analyzerCapabilities = new Set<ExactLanguageAnalyzerCapability>([
	'diagnostics',
	'completions',
	'hover',
	'inlayHints',
	'codeActions'
]);
const projectionCapabilities = new Set<ExactLanguageProjectionCapability>([
	'sourceText',
	'imports',
	'components',
	'enhancements',
	'jsx',
	'expressions',
	'types',
	'projectGraph'
]);

/** Parses and freezes the strict protocol-1 package declaration. */
export function parseExactLanguageDeclaration(value: unknown): ExactLanguageDeclarationV1 {
	if (!isRecord(value)) throw new Error('exact.language must be an object');
	assertKeys(value, ['schemaVersion', 'declarative', 'analyzer'], 'exact.language');
	if (value.schemaVersion !== 1) throw new Error('exact.language.schemaVersion must be 1');
	const declarative = optionalSubpath(value.declarative, 'exact.language.declarative');
	let analyzer: ExactLanguageDeclarationV1['analyzer'];
	if (value.analyzer !== undefined) {
		if (!isRecord(value.analyzer)) throw new Error('exact.language.analyzer must be an object');
		assertKeys(
			value.analyzer,
			['protocolVersion', 'subpath', 'capabilities', 'projection', 'data'],
			'exact.language.analyzer'
		);
		if (typeof value.analyzer.protocolVersion !== 'string' || !value.analyzer.protocolVersion)
			throw new Error('exact.language.analyzer.protocolVersion must be a nonempty string');
		if (!supportsProtocolOne(value.analyzer.protocolVersion))
			throw new Error('exact.language.analyzer.protocolVersion must include protocol 1.0.0');
		const subpath = requiredSubpath(value.analyzer.subpath, 'exact.language.analyzer.subpath');
		const capabilities = enumArray(
			value.analyzer.capabilities,
			analyzerCapabilities,
			'exact.language.analyzer.capabilities'
		);
		if (!capabilities.length)
			throw new Error('exact.language.analyzer.capabilities must not be empty');
		const projection = enumArray(
			value.analyzer.projection,
			projectionCapabilities,
			'exact.language.analyzer.projection'
		);
		const data =
			value.analyzer.data === undefined
				? undefined
				: subpathArray(value.analyzer.data, 'exact.language.analyzer.data');
		analyzer = Object.freeze({
			protocolVersion: value.analyzer.protocolVersion,
			subpath,
			capabilities: Object.freeze(capabilities),
			projection: Object.freeze(projection),
			...(data ? { data: Object.freeze(data) } : {})
		});
	}
	if (!declarative && !analyzer)
		throw new Error('exact.language must declare declarative metadata or an analyzer');
	return Object.freeze({
		schemaVersion: 1,
		...(declarative ? { declarative } : {}),
		...(analyzer ? { analyzer } : {})
	});
}

function supportsProtocolOne(range: string): boolean {
	const normalized = range.trim();
	return (
		/^[~^]?1(?:\.0){0,2}(?:\.x)?$/u.test(normalized) ||
		/^1\.x(?:\.x)?$/u.test(normalized) ||
		/^>=\s*1\.0\.0\s+<\s*2\.0\.0$/u.test(normalized)
	);
}

/** Validates the public-package subpath grammar shared by language declarations. */
export function assertExactLanguagePublicSubpath(value: string, field = 'subpath'): void {
	if (value !== '.' && !/^\.\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value))
		throw new Error(`${field} must be '.' or a public './name' package subpath`);
	if (value.includes('..') || value.includes('\\') || value.endsWith('/'))
		throw new Error(`${field} must not traverse or end with a slash`);
}

function requiredSubpath(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new Error(`${field} must be a string`);
	assertExactLanguagePublicSubpath(value, field);
	return value;
}

function optionalSubpath(value: unknown, field: string): string | undefined {
	return value === undefined ? undefined : requiredSubpath(value, field);
}

function subpathArray(value: unknown, field: string): string[] {
	if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
	return unique(
		value.map((entry, index) => requiredSubpath(entry, `${field}[${index}]`)),
		field
	);
}

function enumArray<T extends string>(value: unknown, allowed: Set<T>, field: string): T[] {
	if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
	const result = value.map((entry, index) => {
		if (typeof entry !== 'string' || !allowed.has(entry as T))
			throw new Error(`${field}[${index}] is not supported`);
		return entry as T;
	});
	return unique(result, field);
}

function unique<T>(values: T[], field: string): T[] {
	if (new Set(values).size !== values.length) throw new Error(`${field} contains duplicates`);
	return values;
}

function assertKeys(value: Record<string, unknown>, keys: readonly string[], field: string): void {
	const allowed = new Set(keys);
	for (const key of Object.keys(value))
		if (!allowed.has(key)) throw new Error(`${field}.${key} is unknown`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

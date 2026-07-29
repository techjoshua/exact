/** Current version of every eXact DevTools request, response, catalog, and event. */
export const EXACT_DEVTOOLS_PROTOCOL_VERSION = 1 as const;

/** Complete build-scoped identity for one observed runtime subject. */
export type ExactInspectionRuntimeId = Readonly<{
	sessionId: string;
	side: 'client' | 'server';
	binding?: string;
	buildKey: string;
	executionRoot: string;
	componentTypeId: string;
	instanceId?: string;
	sourceEntityId?: string;
	operationId?: string;
	generation?: number;
}>;

/** A source point with both UTF-16 offset and human-readable coordinates. */
export type ExactRuntimeSourcePoint = Readonly<{
	offset: number;
	line: number;
	column: number;
}>;

/** Build-relative source location that can be matched without serving source text. */
export type ExactRuntimeSourceLocation = Readonly<{
	path: string;
	sourceHash: string;
	start: ExactRuntimeSourcePoint;
	end: ExactRuntimeSourcePoint;
}>;

/** Compiler-qualified paths and context tokens that must never carry values. */
export type ExactInspectionRedactionCatalog = Readonly<{
	statePaths: readonly string[];
	contextTokens: readonly Readonly<{
		name: string;
		scope: 'component' | 'request' | 'application';
		kind: 'secret' | 'server-resource';
	}>[];
	secretNames: readonly string[];
}>;

/** Runtime-facing compiler entity retained only in a server-owned catalog. */
export type ExactRuntimeSourceEntity = Readonly<{
	id: string;
	kind: string;
	name?: string;
	location: ExactRuntimeSourceLocation;
	classification?: Readonly<Record<string, unknown>>;
	reasons: readonly Readonly<{
		code: string;
		summary: string;
		location: ExactRuntimeSourceLocation;
	}>[];
	children: readonly ExactRuntimeSourceEntity[];
}>;

/** One authored source file represented in a build inspection catalog. */
export type ExactRuntimeSourceFile = Readonly<{
	path: string;
	sourceHash: string;
	components: readonly ExactRuntimeSourceEntity[];
}>;

/** Catalog partition for one execution root. */
export type ExactInspectionRootCatalog = Readonly<{
	executionRoot: string;
	rootComponentId: string;
	files: readonly ExactRuntimeSourceFile[];
	redactions: ExactInspectionRedactionCatalog;
}>;

/** Server-owned compiler catalog selected by an immutable build key. */
export type ExactBuildInspectionCatalog = Readonly<{
	protocol: 1;
	buildKey: string;
	producer: Readonly<{
		packageName?: string;
		version?: string;
	}>;
	roots: Readonly<Record<string, ExactInspectionRootCatalog>>;
}>;

/** Structured reason why one inspection projection is unavailable. */
export type ExactInspectionUnavailableReason =
	| 'debug-disabled'
	| 'not-authorized'
	| 'catalog-not-built'
	| 'runtime-not-instrumented'
	| 'build-retired'
	| 'root-unknown'
	| 'remote-unavailable'
	| 'source-unavailable'
	| 'session-expired';

/** Validates the shape and bounded fields of a runtime identity. */
export function isExactInspectionRuntimeId(value: unknown): value is ExactInspectionRuntimeId {
	if (!record(value)) return false;
	if (
		!boundedString(value.sessionId, 256) ||
		(value.side !== 'client' && value.side !== 'server') ||
		!boundedString(value.buildKey, 256) ||
		!boundedString(value.executionRoot, 512) ||
		!boundedString(value.componentTypeId, 512)
	)
		return false;
	for (const key of ['binding', 'instanceId', 'sourceEntityId', 'operationId'] as const) {
		if (value[key] !== undefined && !boundedString(value[key], 512)) return false;
	}
	return (
		value.generation === undefined ||
		(Number.isSafeInteger(value.generation) && (value.generation as number) >= 0)
	);
}

/** Validates a server-owned catalog before registry insertion. */
export function isExactBuildInspectionCatalog(value: unknown): value is ExactBuildInspectionCatalog {
	if (!record(value) || value.protocol !== EXACT_DEVTOOLS_PROTOCOL_VERSION) return false;
	if (!boundedString(value.buildKey, 256) || !record(value.producer) || !record(value.roots))
		return false;
	for (const [key, root] of Object.entries(value.roots)) {
		if (!boundedString(key, 512) || !validRootCatalog(root, key)) return false;
	}
	return true;
}

function validRootCatalog(value: unknown, key: string): value is ExactInspectionRootCatalog {
	if (!record(value)) return false;
	if (
		value.executionRoot !== key ||
		!boundedString(value.executionRoot, 512) ||
		!boundedString(value.rootComponentId, 512) ||
		!Array.isArray(value.files) ||
		!record(value.redactions)
	)
		return false;
	return value.files.every(
		(file) =>
			record(file) &&
			boundedString(file.path, 2048) &&
			!absolutePath(file.path) &&
			boundedString(file.sourceHash, 128) &&
			Array.isArray(file.components)
	);
}

function absolutePath(path: string): boolean {
	return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(path);
}

function boundedString(value: unknown, maximum: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function record(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

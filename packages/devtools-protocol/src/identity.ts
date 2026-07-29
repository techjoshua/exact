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
	if (
		!boundedString(value.buildKey, 256) ||
		!validProducer(value.producer) ||
		!record(value.roots) ||
		Object.keys(value.roots).length > 100
	)
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
		value.files.length > 10_000 ||
		!validRedactions(value.redactions)
	)
		return false;
	const entityIds = new Set<string>();
	let entities = 0;
	const valid = value.files.every((file) => {
		if (
			!record(file) ||
			!relativeSourcePath(file.path) ||
			!sourceHash(file.sourceHash) ||
			!Array.isArray(file.components)
		)
			return false;
		return file.components.every((component) =>
			validEntity(component, file.path, file.sourceHash, entityIds, () => ++entities <= 100_000)
		);
	});
	return valid && entityIds.has(value.rootComponentId);
}

function validProducer(value: unknown): boolean {
	if (!record(value) || hasValueField(value)) return false;
	return (
		(value.packageName === undefined || boundedString(value.packageName, 512)) &&
		(value.version === undefined || boundedString(value.version, 128))
	);
}

function validRedactions(value: unknown): value is ExactInspectionRedactionCatalog {
	if (
		!record(value) ||
		hasValueField(value) ||
		!Array.isArray(value.statePaths) ||
		!Array.isArray(value.contextTokens) ||
		!Array.isArray(value.secretNames) ||
		value.statePaths.length > 10_000 ||
		value.contextTokens.length > 10_000 ||
		value.secretNames.length > 10_000
	)
		return false;
	return (
		value.statePaths.every((path) => boundedString(path, 2048)) &&
		value.secretNames.every((name) => boundedString(name, 512)) &&
		value.contextTokens.every(
			(token) =>
				record(token) &&
				!hasValueField(token) &&
				boundedString(token.name, 512) &&
				['component', 'request', 'application'].includes(token.scope) &&
				['secret', 'server-resource'].includes(token.kind)
		)
	);
}

function validEntity(
	value: unknown,
	path: string,
	hash: string,
	ids: Set<string>,
	count: () => boolean
): value is ExactRuntimeSourceEntity {
	if (
		!count() ||
		!record(value) ||
		hasValueField(value) ||
		!boundedString(value.id, 1024) ||
		ids.has(value.id) ||
		!boundedString(value.kind, 128) ||
		(value.name !== undefined && !boundedString(value.name, 512)) ||
		!validLocation(value.location, path, hash) ||
		(value.classification !== undefined &&
			(!record(value.classification) || !boundedJson(value.classification, 0))) ||
		!Array.isArray(value.reasons) ||
		value.reasons.length > 1_000 ||
		!Array.isArray(value.children) ||
		value.children.length > 10_000
	)
		return false;
	ids.add(value.id);
	if (
		!value.reasons.every(
			(reason) =>
				record(reason) &&
				!hasValueField(reason) &&
				boundedString(reason.code, 256) &&
				boundedString(reason.summary, 4_096) &&
				validLocation(reason.location, path, hash)
		)
	)
		return false;
	return value.children.every((child) => validEntity(child, path, hash, ids, count));
}

function validLocation(value: unknown, path: string, hash: string): boolean {
	if (
		!record(value) ||
		value.path !== path ||
		value.sourceHash !== hash ||
		!validPoint(value.start) ||
		!validPoint(value.end)
	)
		return false;
	return value.start.offset <= value.end.offset;
}

function validPoint(value: unknown): boolean {
	return (
		record(value) &&
		nonnegativeInteger(value.offset) &&
		positiveInteger(value.line) &&
		positiveInteger(value.column)
	);
}

function boundedJson(value: unknown, depth: number): boolean {
	if (depth > 20) return false;
	if (
		value === null ||
		typeof value === 'boolean' ||
		(typeof value === 'number' && Number.isFinite(value)) ||
		(typeof value === 'string' && value.length <= 16_384)
	)
		return true;
	if (Array.isArray(value))
		return value.length <= 10_000 && value.every((item) => boundedJson(item, depth + 1));
	if (!record(value) || hasValueField(value) || Object.keys(value).length > 1_000) return false;
	return Object.entries(value).every(
		([key, item]) => key.length <= 512 && boundedJson(item, depth + 1)
	);
}

function hasValueField(value: Record<string, unknown>): boolean {
	return Object.prototype.hasOwnProperty.call(value, 'value');
}

function relativeSourcePath(value: unknown): value is string {
	return (
		boundedString(value, 2048) &&
		!(/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value)) &&
		!value.split(/[\\/]/).includes('..')
	);
}

function sourceHash(value: unknown): value is string {
	return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function nonnegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) > 0;
}

function boundedString(value: unknown, maximum: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function record(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

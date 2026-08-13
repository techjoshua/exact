import type { ExactLanguageExtensionRole, ExactLanguageExtensionsConfig } from '@exactjs/config';
import {
	exactLanguageProtocolLimits,
	type ExactLanguageAnalyzerCapability,
	type ExactLanguageDiagnosticV1,
	type ExactLanguageJsonValue,
	type ExactLanguageProjectionV1
} from '@exactjs/language-extension-api';
import type {
	ExactHostedLanguageDiagnostic,
	ExactLanguageProviderDescriptor,
	ExactLanguageProviderStatus
} from './contracts.js';

/** Restricts a compiler projection to the fields a provider declared it needs. */
export function projectFor(
	provider: ExactLanguageProviderDescriptor,
	projection: ExactLanguageProjectionV1
): ExactLanguageProjectionV1 {
	const has = (value: string): boolean => provider.projection.includes(value);
	return Object.freeze({
		...projection,
		document: Object.freeze({
			...projection.document,
			...(has('sourceText') ? {} : { text: undefined })
		}),
		imports: has('imports') ? projection.imports : [],
		components: has('components') ? projection.components : [],
		enhancements: has('enhancements') ? projection.enhancements : [],
		jsx: has('jsx') ? projection.jsx : [],
		expressions: has('expressions') ? projection.expressions : [],
		types: has('types') ? projection.types : []
	});
}

/** Reads the JSON configuration assigned to one provider identifier. */
export function providerConfiguration(
	config: ExactLanguageExtensionsConfig | undefined,
	id: string
): ExactLanguageJsonValue | undefined {
	return (config?.providers as Record<string, ExactLanguageJsonValue> | undefined)?.[id];
}

/** Reports whether workspace policy suppresses a provider capability. */
export function roleIgnored(
	config: ExactLanguageExtensionsConfig | undefined,
	descriptor: ExactLanguageProviderDescriptor,
	capability: ExactLanguageExtensionRole
): boolean {
	return (config?.ignore ?? []).some((rule) => {
		if (!rule.roles.includes(capability)) return false;
		if ('provider' in rule) return rule.provider === descriptor.id;
		return (
			selectorMatchesPackage(rule.package, descriptor.id) &&
			(!rule.version || rule.version === descriptor.version) &&
			(!rule.integrity || rule.integrity === descriptor.integrity)
		);
	});
}

function selectorMatchesPackage(selector: string, name: string): boolean {
	return selector.endsWith('/') ? name.startsWith(selector) : selector === name;
}

/** Projects immutable provider provenance and ignored roles into status output. */
export function providerStatusProvenance(
	descriptor: ExactLanguageProviderDescriptor,
	config: ExactLanguageExtensionsConfig | undefined
): Pick<
	ExactLanguageProviderStatus,
	'packageRoot' | 'manifestPath' | 'integrity' | 'entry' | 'ignoredRoles'
> {
	const roles: ExactLanguageExtensionRole[] = [
		'declarative',
		'analyzer',
		'diagnostics',
		'completions',
		'hover',
		'inlayHints',
		'codeActions'
	];
	return Object.freeze({
		packageRoot: descriptor.packageRoot,
		manifestPath: descriptor.manifestPath,
		...(descriptor.integrity ? { integrity: descriptor.integrity } : {}),
		...(descriptor.entry ? { entry: descriptor.entry } : {}),
		ignoredRoles: Object.freeze(roles.filter((role) => roleIgnored(config, descriptor, role)))
	});
}

/** Tests a provider diagnostic against a configured code and path selector. */
export function matchesDiagnosticSelector(
	selector: Readonly<{ provider: string; codes: readonly string[]; paths?: readonly string[] }>,
	provider: string,
	code: string,
	path: string
): boolean {
	return (
		selector.provider === provider &&
		(selector.codes.includes('*') || selector.codes.includes(code)) &&
		(!selector.paths?.length ||
			selector.paths.some((candidate) =>
				candidate.endsWith('/') ? path.startsWith(candidate) : path === candidate
			))
	);
}

/** Rejects malformed or out-of-bounds diagnostics from an isolated provider. */
export function validateDiagnostic(
	projection: ExactLanguageProjectionV1,
	diagnostic: ExactLanguageDiagnosticV1
): void {
	const length = projection.document.text?.length;
	if (
		!diagnostic.code ||
		diagnostic.code.includes('/') ||
		diagnostic.range.start < 0 ||
		diagnostic.range.end < diagnostic.range.start ||
		(length !== undefined && diagnostic.range.end > length)
	)
		throw new Error('Language provider returned an invalid diagnostic');
	if ((diagnostic.related?.length ?? 0) > exactLanguageProtocolLimits.relatedRanges)
		throw new Error('Language provider exceeded the related-range limit');
	for (const related of diagnostic.related ?? [])
		if (
			typeof related.message !== 'string' ||
			related.range.start < 0 ||
			related.range.end < related.range.start
		)
			throw new Error('Language provider returned an invalid related range');
}

/** Rejects malformed, excessive, or out-of-bounds interactive provider results. */
export function validateInteractiveResult(
	capability: Exclude<ExactLanguageAnalyzerCapability, 'diagnostics'>,
	projection: ExactLanguageProjectionV1,
	items: readonly unknown[]
): void {
	const limit =
		capability === 'codeActions'
			? exactLanguageProtocolLimits.codeActionItems
			: capability === 'inlayHints'
				? 1_000
				: exactLanguageProtocolLimits.completionItems;
	if (items.length > limit)
		throw new Error(`Language provider exceeded the ${capability} result limit`);
	for (const item of items) {
		if (!isRecord(item))
			throw new Error(`Language provider returned an invalid ${capability} result`);
		if (capability === 'completions') {
			if (typeof item.label !== 'string' || !validRange(item.replace, projection, true))
				throw new Error('Language provider returned an invalid completion');
		} else if (capability === 'hover') {
			if (typeof item.markdown !== 'string' || !validRange(item.range, projection, true))
				throw new Error('Language provider returned an invalid hover');
		} else if (capability === 'inlayHints') {
			if (
				typeof item.position !== 'number' ||
				item.position < 0 ||
				item.position > (projection.document.text?.length ?? Number.MAX_SAFE_INTEGER) ||
				typeof item.label !== 'string'
			)
				throw new Error('Language provider returned an invalid inlay hint');
			if (
				item.evidence !== undefined &&
				(!Array.isArray(item.evidence) ||
					item.evidence.length > exactLanguageProtocolLimits.inferenceEvidencePerHint)
			)
				throw new Error('Language provider returned excessive inference evidence');
			for (const evidence of (item.evidence as readonly unknown[] | undefined) ?? [])
				if (
					!isRecord(evidence) ||
					typeof evidence.kind !== 'string' ||
					!/^[a-z][a-z0-9-]{0,63}$/u.test(evidence.kind) ||
					typeof evidence.explanation !== 'string' ||
					Buffer.byteLength(evidence.explanation) > exactLanguageProtocolLimits.messageBytes ||
					!validRange(evidence.range, projection, false)
				)
					throw new Error('Language provider returned invalid inference evidence');
		} else validateCodeAction(item, projection);
	}
}

/** Validates that a provider code action safely edits only its projected document. */
export function validateCodeAction(
	item: Readonly<Record<string, unknown>>,
	projection: ExactLanguageProjectionV1
): void {
	if (
		typeof item.title !== 'string' ||
		(item.kind !== 'quickfix' && item.kind !== 'refactor') ||
		!Array.isArray(item.edits) ||
		item.edits.length > exactLanguageProtocolLimits.codeActionItems
	)
		throw new Error('Language provider returned an invalid code action');
	const ranges: Array<Readonly<{ start: number; end: number }>> = [];
	let changedBytes = 0;
	for (const value of item.edits) {
		if (!isRecord(value)) throw new Error('Language provider returned an invalid code-action edit');
		if (
			value.uri !== projection.document.uri ||
			value.version !== projection.document.version ||
			typeof value.newText !== 'string' ||
			!validRange(value.range, projection, false)
		)
			throw new Error('Language provider code actions may edit only the current document version');
		changedBytes += Buffer.byteLength(value.newText as string);
		if (changedBytes > exactLanguageProtocolLimits.codeActionChangedBytes)
			throw new Error('Language provider exceeded the code-action changed-text limit');
		ranges.push(value.range as Readonly<{ start: number; end: number }>);
	}
	ranges.sort((left, right) => left.start - right.start || left.end - right.end);
	for (let index = 1; index < ranges.length; index++)
		if (ranges[index - 1]!.end > ranges[index]!.start)
			throw new Error('Language provider returned overlapping code-action edits');
}

function validRange(
	value: unknown,
	projection: ExactLanguageProjectionV1,
	optional: boolean
): boolean {
	if (value === undefined) return optional;
	if (!isRecord(value) || typeof value.start !== 'number' || typeof value.end !== 'number')
		return false;
	return (
		value.start >= 0 &&
		value.end >= value.start &&
		value.end <= (projection.document.text?.length ?? Number.MAX_SAFE_INTEGER)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Asserts that provider configuration is bounded, acyclic JSON-compatible data. */
export function assertJsonValue(
	value: unknown,
	field: string,
	depth = 0,
	seen = new Set<object>()
): void {
	if (value === undefined) return;
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		(typeof value === 'number' && Number.isFinite(value))
	)
		return;
	if (typeof value !== 'object') throw new Error(`${field} must contain only JSON values`);
	if (depth >= exactLanguageProtocolLimits.nestingDepth)
		throw new Error(`${field} exceeds the language configuration nesting limit`);
	if (seen.has(value)) throw new Error(`${field} must not contain cycles`);
	seen.add(value);
	if (Array.isArray(value))
		value.forEach((entry, index) => assertJsonValue(entry, `${field}[${index}]`, depth + 1, seen));
	else
		Object.entries(value).forEach(([key, entry]) =>
			assertJsonValue(entry, `${field}.${key}`, depth + 1, seen)
		);
	seen.delete(value);
}

/** Orders hosted diagnostics deterministically by location, provider, and code. */
export function compareHostedDiagnostics(
	left: ExactHostedLanguageDiagnostic,
	right: ExactHostedLanguageDiagnostic
): number {
	return (
		left.diagnostic.range.start - right.diagnostic.range.start ||
		left.diagnostic.range.end - right.diagnostic.range.end ||
		left.provider.localeCompare(right.provider) ||
		left.diagnostic.code.localeCompare(right.diagnostic.code)
	);
}

/** Throws the abort reason when a language request has been cancelled. */
export function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted)
		throw signal.reason instanceof Error ? signal.reason : new Error('Language request aborted');
}

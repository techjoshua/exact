import { createHash } from 'node:crypto';
import path from 'node:path';
import type {
	ExactBuildInspectionCatalog,
	ExactInspectionRedactionCatalog,
	ExactInspectionRootCatalog,
	ExactRuntimeSourceEntity,
	ExactRuntimeSourceFile,
	ExactRuntimeSourceLocation
} from '@exactjs/devtools-protocol';
import type {
	ExactSourceEntity,
	ExactSourceInspection,
	ExactSourceRange
} from './contracts.js';
import type { ExactCompilerManifest } from '../contracts/manifest.js';

/** One execution-root partition supplied to build catalog creation. */
export type ExactBuildInspectionRootInput = Readonly<{
	executionRoot: string;
	rootComponentId: string;
	inspections: readonly ExactSourceInspection[];
	sources: Readonly<Record<string, string>>;
	redactions?: Partial<ExactInspectionRedactionCatalog>;
}>;

/** Configuration for one immutable server-owned inspection catalog. */
export type ExactBuildInspectionCatalogOptions = Readonly<{
	buildKey: string;
	root: string;
	producer?: Readonly<{ packageName?: string; version?: string }>;
	roots: readonly ExactBuildInspectionRootInput[];
}>;

/**
 * Creates a server catalog with deterministic hashes and relative source locations.
 *
 * Source content is used only to calculate coordinates and hashes. It is not retained in the
 * returned catalog.
 */
export function createExactBuildInspectionCatalog(
	options: ExactBuildInspectionCatalogOptions
): ExactBuildInspectionCatalog {
	if (!options.buildKey) throw new Error('eXact inspection build key must not be empty');
	const roots: Record<string, ExactInspectionRootCatalog> = {};
	for (const input of options.roots) {
		if (roots[input.executionRoot])
			throw new Error(`Duplicate eXact inspection root ${input.executionRoot}`);
		roots[input.executionRoot] = createRootCatalog(options.root, input);
	}
	return Object.freeze({
		protocol: 1,
		buildKey: options.buildKey,
		producer: Object.freeze({ ...(options.producer ?? {}) }),
		roots: Object.freeze(roots)
	});
}

/** Returns a stable SHA-256 source hash used to reject mismatched source projections. */
export function exactInspectionSourceHash(source: string): string {
	return createHash('sha256').update(source).digest('hex');
}

/** Derives an immutable build key from relative authored paths and their exact source bytes. */
export function createExactInspectionBuildKey(
	projectRoot: string,
	entries: readonly Readonly<{ filename: string; source: string }>[]
): string {
	const hash = createHash('sha1');
	for (const entry of [...entries].sort((left, right) =>
		left.filename.localeCompare(right.filename)
	)) {
		const filename = path.resolve(entry.filename);
		const relative = normalizeRelativePath(projectRoot, filename);
		hash.update(relative);
		hash.update('\0');
		hash.update(exactInspectionSourceHash(entry.source));
		hash.update('\0');
	}
	return hash.digest('hex');
}

/** Projects compiler data-policy identities into a value-free runtime redaction catalog. */
export function createExactInspectionRedactions(
	manifests: readonly ExactCompilerManifest[],
	configured: Partial<ExactInspectionRedactionCatalog> = {}
): ExactInspectionRedactionCatalog {
	const statePaths = new Set(configured.statePaths ?? []);
	const contextTokens = new Map(
		(configured.contextTokens ?? []).map((token) => [
			`${token.name}\0${token.scope}\0${token.kind}`,
			token
		])
	);
	const secretNames = new Set(configured.secretNames ?? []);
	for (const manifest of manifests) {
		for (const subject of manifest.policy.subjects) {
			if (subject.policy.secret && subject.selector) secretNames.add(subject.selector);
			if (subject.kind === 'state' && subject.policy.secret) {
				const path = subject.path ?? subject.name;
				statePaths.add(path.startsWith('state.') ? path : `state.${path}`);
			}
			if (subject.kind === 'context') {
				const token = Object.freeze({
					name: subject.selector ?? subject.name,
					scope: 'component' as const,
					kind: subject.policy.secret ? ('secret' as const) : ('server-resource' as const)
				});
				if (subject.policy.secret || subject.policy.residency === 'server')
					contextTokens.set(`${token.name}\0${token.scope}\0${token.kind}`, token);
			}
		}
		for (const consumer of manifest.policy.secretConsumers)
			if (consumer.selector) secretNames.add(consumer.selector);
	}
	return Object.freeze({
		statePaths: Object.freeze([...statePaths].sort()),
		contextTokens: Object.freeze(
			[...contextTokens.values()].sort((left, right) => left.name.localeCompare(right.name))
		),
		secretNames: Object.freeze([...secretNames].sort())
	});
}

function createRootCatalog(
	projectRoot: string,
	input: ExactBuildInspectionRootInput
): ExactInspectionRootCatalog {
	const files = input.inspections.map((inspection) =>
		createRuntimeSourceFile(projectRoot, inspection, sourceForInspection(inspection, input.sources))
	);
	return Object.freeze({
		executionRoot: input.executionRoot,
		rootComponentId: input.rootComponentId,
		files: Object.freeze(files),
		redactions: Object.freeze({
			statePaths: Object.freeze([...(input.redactions?.statePaths ?? [])]),
			contextTokens: Object.freeze([...(input.redactions?.contextTokens ?? [])]),
			secretNames: Object.freeze([...(input.redactions?.secretNames ?? [])])
		})
	});
}

function createRuntimeSourceFile(
	projectRoot: string,
	inspection: ExactSourceInspection,
	source: string
): ExactRuntimeSourceFile {
	const sourceHash = exactInspectionSourceHash(source);
	const relative = normalizeRelativePath(projectRoot, inspection.filename);
	return Object.freeze({
		path: relative,
		sourceHash,
		components: Object.freeze(
			inspection.components.map((component) =>
				createRuntimeEntity(component, source, relative, sourceHash)
			)
		)
	});
}

function createRuntimeEntity(
	entity: ExactSourceEntity,
	source: string,
	filename: string,
	sourceHash: string
): ExactRuntimeSourceEntity {
	return Object.freeze({
		id: entity.id,
		kind: entity.kind,
		...(entity.name ? { name: entity.name } : {}),
		location: runtimeLocation(filename, sourceHash, source, entity.range),
		...(entity.classification
			? { classification: Object.freeze(structuredClone(entity.classification)) }
			: {}),
		reasons: Object.freeze(
			entity.reasons.map((reason) =>
				Object.freeze({
					code: reason.code,
					summary: reason.summary,
					location: runtimeLocation(filename, sourceHash, source, reason.range)
				})
			)
		),
		children: Object.freeze(
			entity.children.map((child) =>
				createRuntimeEntity(child, source, filename, sourceHash)
			)
		)
	});
}

function runtimeLocation(
	filename: string,
	sourceHash: string,
	source: string,
	range: ExactSourceRange
): ExactRuntimeSourceLocation {
	return Object.freeze({
		path: filename,
		sourceHash,
		start: Object.freeze(sourcePoint(source, range.start)),
		end: Object.freeze(sourcePoint(source, range.end))
	});
}

function sourcePoint(
	source: string,
	offset: number
): { offset: number; line: number; column: number } {
	const bounded = Math.max(0, Math.min(offset, source.length));
	const before = source.slice(0, bounded);
	const lastBreak = before.lastIndexOf('\n');
	return {
		offset: bounded,
		line: before.split('\n').length,
		column: bounded - lastBreak
	};
}

function normalizeRelativePath(projectRoot: string, filename: string): string {
	const relative = path.isAbsolute(filename) ? path.relative(projectRoot, filename) : filename;
	const normalized = relative.replaceAll(path.sep, '/').replace(/^\.\//, '');
	if (!normalized || normalized === '..' || normalized.startsWith('../') || path.isAbsolute(normalized))
		throw new Error(`Inspection source ${filename} is outside project root ${projectRoot}`);
	return normalized;
}

function sourceForInspection(
	inspection: ExactSourceInspection,
	sources: Readonly<Record<string, string>>
): string {
	const direct = sources[inspection.filename];
	if (direct !== undefined) return direct;
	const resolved = sources[path.resolve(inspection.filename)];
	if (resolved !== undefined) return resolved;
	throw new Error(`Missing authored source for inspection ${inspection.filename}`);
}

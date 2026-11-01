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
import type { ExactSourceEntity, ExactSourceInspection, ExactSourceRange } from './contracts.js';
import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';

/** One execution-root partition supplied to build catalog creation. */
export type ExactBuildInspectionRootInput = Readonly<{
	executionRoot: string;
	rootComponentId: string;
	inspections: readonly ExactSourceInspection[];
	sources: Readonly<Record<string, string>>;
	redactions?: Partial<ExactInspectionRedactionCatalog>;
}>;

/** Configuration for one server-owned inspection catalog. */
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
		roots[input.executionRoot] = createRootCatalog(options.root, options.buildKey, input);
	}
	return {
		protocol: 1,
		buildKey: options.buildKey,
		producer: { ...(options.producer ?? {}) },
		roots: roots
	};
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
	analyses: readonly ExactModuleAnalysis[],
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
	for (const analysis of analyses) {
		for (const subject of analysis.policy.subjects) {
			if (subject.policy.secret) secretNames.add(subject.selector ?? subject.name);
			if (subject.kind === 'state' && subject.policy.secret) {
				const path = subject.path ?? subject.name;
				statePaths.add(path.startsWith('state.') ? path : `state.${path}`);
			}
			if (subject.kind === 'context') {
				const token = {
					name: subject.selector ?? subject.name,
					scope: 'component' as const,
					kind: subject.policy.secret ? ('secret' as const) : ('server-resource' as const)
				};
				if (subject.policy.secret || subject.policy.residency === 'server')
					contextTokens.set(`${token.name}\0${token.scope}\0${token.kind}`, token);
			}
		}
		for (const consumer of analysis.policy.secretConsumers)
			if (consumer.selector) secretNames.add(consumer.selector);
	}
	return {
		statePaths: [...statePaths].sort(),
		contextTokens: [...contextTokens.values()].sort((left, right) =>
			left.name.localeCompare(right.name)
		),
		secretNames: [...secretNames].sort()
	};
}

function createRootCatalog(
	projectRoot: string,
	buildKey: string,
	input: ExactBuildInspectionRootInput
): ExactInspectionRootCatalog {
	const files = input.inspections.map((inspection) =>
		createRuntimeSourceFile(projectRoot, inspection, sourceForInspection(inspection, input.sources))
	);
	return {
		executionRoot: input.executionRoot,
		rootComponentId: input.rootComponentId,
		files: files,
		partitionPlans: input.inspections.map((inspection) => ({
			...structuredClone(inspection.partitionPlan),
			buildKey
		})),
		redactions: {
			statePaths: [...(input.redactions?.statePaths ?? [])],
			contextTokens: [...(input.redactions?.contextTokens ?? [])],
			secretNames: [...(input.redactions?.secretNames ?? [])]
		}
	};
}

function createRuntimeSourceFile(
	projectRoot: string,
	inspection: ExactSourceInspection,
	source: string
): ExactRuntimeSourceFile {
	const sourceHash = exactInspectionSourceHash(source);
	const relative = normalizeRelativePath(projectRoot, inspection.filename);
	return {
		path: relative,
		sourceHash,
		components: inspection.components.map((component) =>
			createRuntimeEntity(component, source, relative, sourceHash)
		)
	};
}

/** Projects source trees in authored depth-first order without native recursion. */
function createRuntimeEntity(
	entity: ExactSourceEntity,
	source: string,
	filename: string,
	sourceHash: string
): ExactRuntimeSourceEntity {
	const node = runtimeEntityNode(entity, source, filename, sourceHash);
	const frames = [{ entity, node, index: 0 }];
	while (frames.length) {
		const frame = frames[frames.length - 1]!;
		if (frame.index >= frame.entity.children.length) {
			frames.pop();
			continue;
		}
		const child = frame.entity.children[frame.index++]!;
		const childNode = runtimeEntityNode(child, source, filename, sourceHash);
		frame.node.children.push(childNode);
		frames.push({ entity: child, node: childNode, index: 0 });
	}
	return node;
}

/** Creates the parent metadata before the frame takes ownership of its mutable child list. */
function runtimeEntityNode(
	entity: ExactSourceEntity,
	source: string,
	filename: string,
	sourceHash: string
): ExactRuntimeSourceEntity & { children: ExactRuntimeSourceEntity[] } {
	return {
		id: entity.id,
		kind: entity.kind,
		...(entity.name ? { name: entity.name } : {}),
		location: runtimeLocation(filename, sourceHash, source, entity.range),
		...(entity.classification ? { classification: structuredClone(entity.classification) } : {}),
		reasons: entity.reasons.map((reason) => ({
			code: reason.code,
			summary: reason.summary,
			location: runtimeLocation(filename, sourceHash, source, reason.range)
		})),
		children: []
	};
}

function runtimeLocation(
	filename: string,
	sourceHash: string,
	source: string,
	range: ExactSourceRange
): ExactRuntimeSourceLocation {
	return {
		path: filename,
		sourceHash,
		start: sourcePoint(source, range.start),
		end: sourcePoint(source, range.end)
	};
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
	if (
		!normalized ||
		normalized === '..' ||
		normalized.startsWith('../') ||
		path.isAbsolute(normalized)
	)
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

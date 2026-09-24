import type { ExactComponentBuildFacts, ModuleRewriteOptions, TransformResult } from '../types.js';

const prefix = '// exact:component-build/';
const marker = `${prefix}1 `;

/** Appends inert, portable importer facts without shifting executable source-map positions. */
export function retainArtifactComponentFacts(
	result: TransformResult,
	rewrite?: ModuleRewriteOptions
): TransformResult {
	const facts = result.componentBuild;
	if (!facts.componentImports.length && !facts.rendererEnhancements.length) return result;
	const componentImports = facts.componentImports.map((edge) => {
		const replacement = rewrite?.replacements?.find(
			(value) =>
				value.sourceModule === edge.moduleSpecifier && value.sourceExport === edge.exportName
		);
		return {
			...edge,
			moduleSpecifier:
				replacement?.targetModule ??
				rewrite?.moduleAliases?.[edge.moduleSpecifier] ??
				edge.moduleSpecifier,
			exportName: replacement?.targetExport ?? edge.exportName
		};
	});
	const projection = {
		protocol: 1,
		components: facts.components,
		componentImports,
		rendererEnhancements: result.rendererEnhancements ?? facts.rendererEnhancements
	};
	return {
		...result,
		code: `${result.code}\n${marker}${Buffer.from(JSON.stringify(projection)).toString('base64url')}\n`
	};
}

/** Reads compiler artifact facts; malformed marked metadata fails before resolver authorization. */
export function readExactArtifactComponentFacts(
	source: string,
	filename: string
): ExactComponentBuildFacts | undefined {
	const lines = source.split('\n').filter((line) => line.startsWith(prefix));
	if (!lines.length) return undefined;
	if (lines.length !== 1) throw new TypeError('Duplicate artifact component build facts');
	if (!lines[0]!.startsWith(marker))
		throw new TypeError('Unsupported artifact component build facts');
	const payload = lines[0]!.slice(marker.length);
	if (!/^[A-Za-z0-9_-]+$/.test(payload))
		throw new TypeError('Malformed artifact component build facts');
	const facts: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	if (
		!record(facts) ||
		facts.protocol !== 1 ||
		!Array.isArray(facts.components) ||
		!Array.isArray(facts.componentImports) ||
		!Array.isArray(facts.rendererEnhancements) ||
		!facts.components.every(
			(value: unknown) =>
				record(value) &&
				text(value.id) &&
				typeof value.placement === 'string' &&
				['client', 'server', 'isomorphic'].includes(value.placement) &&
				targets(value.artifactTargets)
		) ||
		!facts.componentImports.every(
			(value: unknown) =>
				record(value) &&
				text(value.ownerComponentId) &&
				text(value.moduleSpecifier) &&
				text(value.exportName) &&
				targets(value.artifactTargets) &&
				(value.canonicalComponentId === undefined || text(value.canonicalComponentId)) &&
				typeof value.reason === 'string' &&
				['render', 'enhancement', 'registry', 'task-owner', 'continuation'].includes(value.reason)
		) ||
		!facts.rendererEnhancements.every(
			(value: unknown) =>
				record(value) &&
				text(value.identity) &&
				text(value.moduleSpecifier) &&
				text(value.exportName)
		)
	)
		throw new TypeError('Invalid artifact component build facts');
	return { ...(facts as Omit<ExactComponentBuildFacts, 'filename'>), filename };
}

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}
function targets(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((target) => target === 'client' || target === 'server') &&
		new Set(value).size === value.length
	);
}

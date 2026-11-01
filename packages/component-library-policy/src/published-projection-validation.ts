import { componentLibraryProtocolVersion } from './protocol-version.js';
import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';

/** Validates descriptive published inference without requiring every module to be executable. */
export function validatePublishedComponentProjection(
	facts: unknown,
	modulePath: string,
	invalid: (message: string) => never
): void {
	if (
		!isRecord(facts) ||
		facts.protocol !== componentLibraryProtocolVersion ||
		!Array.isArray(facts.components) ||
		!Array.isArray(facts.componentImports) ||
		!Array.isArray(facts.rendererEnhancements)
	)
		invalid(`module ${modulePath} has an invalid component projection`);
	const projection = facts as ExactPublishedComponentBuildFacts['modules'][number]['facts'];
	const componentIds = new Set<string>();
	for (const component of projection.components) {
		if (
			!isRecord(component) ||
			typeof component.id !== 'string' ||
			!component.id ||
			!['client', 'server', 'isomorphic', 'unknown'].includes(String(component.placement)) ||
			!validArtifactTargets(component.artifactTargets) ||
			componentIds.has(component.id)
		)
			invalid(`module ${modulePath} has an invalid component record`);
		componentIds.add(component.id);
	}
	for (const edge of projection.componentImports)
		if (
			!isRecord(edge) ||
			typeof edge.ownerComponentId !== 'string' ||
			!edge.ownerComponentId ||
			typeof edge.moduleSpecifier !== 'string' ||
			!edge.moduleSpecifier ||
			typeof edge.exportName !== 'string' ||
			!edge.exportName ||
			(edge.canonicalComponentId !== undefined && typeof edge.canonicalComponentId !== 'string') ||
			!validArtifactTargets(edge.artifactTargets) ||
			!['render', 'enhancement', 'registry', 'task-owner', 'continuation'].includes(
				String(edge.reason)
			)
		)
			invalid(`module ${modulePath} has an invalid component import`);
	for (const enhancement of projection.rendererEnhancements)
		if (
			!isRecord(enhancement) ||
			!nonemptyString(enhancement.identity) ||
			!nonemptyString(enhancement.moduleSpecifier) ||
			!nonemptyString(enhancement.exportName)
		)
			invalid(`module ${modulePath} has an invalid renderer enhancement`);
}

function validArtifactTargets(value: unknown): value is readonly ('client' | 'server')[] {
	return (
		Array.isArray(value) &&
		value.every((target) => target === 'client' || target === 'server') &&
		new Set(value).size === value.length
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

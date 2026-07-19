import { stableId } from '../ids.js';

import {
	clientComponentBoundaryId,
	generatedComponentName,
	serverSlotBoundaryId
} from '../names.js';

import type {
	ExactBoundaryIR,
	ExactComponentIR,
	ExactComponentRenderEdgeIR,
	ExactImportedComponentIR
} from '../types.js';

import type { ExpressionComponentPlan, ExpressionRenderSite } from './contracts.js';

/** Resolves expression render sites against local/imported component metadata. */
export function createExpressionRenderEdges(
	filename: string,
	componentName: string,
	renders: readonly ExpressionRenderSite[],
	componentInfo: ReadonlyMap<string, ExactImportedComponentIR>
): ExactComponentRenderEdgeIR[] {
	const edges: ExactComponentRenderEdgeIR[] = [];
	for (const render of renders) {
		const component = componentInfo.get(render.tag);
		if (!component) continue;
		const index = edges.length + 1;
		edges.push({
			id: stableId(
				filename,
				componentName,
				'render-edge',
				render.nodeId,
				render.tag,
				component.componentId ?? component.name
			),
			tag: render.tag,
			name: component.boundaryName ?? component.name,
			componentId: component.componentId,
			placement: component.placement,
			boundary: component.placement,
			index,
			path: render.path
		});
	}
	return edges;
}

/** Creates client-component and server-slot boundaries from expression render sites. */
export function createExpressionComponentBoundaries(
	filename: string,
	components: readonly ExactComponentIR[],
	plan: ExpressionComponentPlan,
	componentInfo: ReadonlyMap<string, ExactImportedComponentIR>
): ExactBoundaryIR[] {
	const boundaries: ExactBoundaryIR[] = [];
	const seen = new Set<string>();
	for (const owner of components) {
		const site = plan.sites.get(owner.name);
		if (!site) continue;
		for (const render of site.renders) {
			const component = componentInfo.get(render.tag);
			if (!component || component.placement !== 'client') continue;
			const name = component.boundaryName ?? component.name;
			const id = clientComponentBoundaryId(filename, name, render.nodeId);
			if (seen.has(id)) continue;
			seen.add(id);
			const edge = owner.renderEdges.find(
				(candidate) => candidate.path === render.path && candidate.tag === render.tag
			);
			boundaries.push({
				id,
				name,
				componentId: component.componentId,
				ownerComponentId: owner.id,
				renderEdgeId: edge?.id,
				renderEdgeIndex: edge?.index,
				renderPath: edge?.path,
				kind: 'client-island'
			});
			if (render.serverSlotChildren) {
				boundaries.push({
					id: serverSlotBoundaryId(id),
					name: `${name}:children`,
					componentId: component.componentId,
					ownerComponentId: owner.id,
					renderEdgeId: edge?.id,
					renderEdgeIndex: edge?.index,
					renderPath: edge?.path,
					kind: 'server-slot'
				});
			}
		}
	}
	return boundaries;
}

/** Creates server-slot boundaries for generated intrinsic client islands. */
export function createExpressionGeneratedServerSlotBoundaries(
	filename: string,
	components: readonly ExactComponentIR[],
	plan: ExpressionComponentPlan,
	componentInfo: ReadonlyMap<string, ExactImportedComponentIR>
): ExactBoundaryIR[] {
	const boundaries: ExactBoundaryIR[] = [];
	for (const owner of components) {
		const site = plan.sites.get(owner.name);
		if (!site) continue;
		for (const island of site.clientIslands) {
			const hasServerComponent = island.childTags.some(
				(tag) => componentInfo.get(tag)?.placement === 'server'
			);
			if (!island.serverOnlyChildren && !hasServerComponent) continue;
			const islandId = stableId(filename, owner.name, 'client-island', String(island.index));
			boundaries.push({
				id: serverSlotBoundaryId(islandId),
				name: `${generatedComponentName(owner.name, 'client-island', island.index)}:children`,
				componentId: owner.id,
				ownerComponentId: owner.id,
				kind: 'server-slot'
			});
		}
	}
	return boundaries;
}

import { sourceEntities } from './source-entity-traversal.js';
import type { ExactRuntimeInspectionCorrelation } from '../types.js';
import type { ExactSourceInspection } from './contracts.js';

/** Derives compact runtime slots from the same canonical source entities used by language tools. */
export function createExactRuntimeInspectionCorrelation(
	inspection: ExactSourceInspection
): ExactRuntimeInspectionCorrelation {
	return {
		protocol: 1,
		components: inspection.components.map((component) => ({
			componentTypeId: component.id,
			slots: flattenEntitySlots(component.children)
		}))
	};
}

function flattenEntitySlots(
	entities: ExactSourceInspection['components'][number]['children']
): Array<Readonly<{ id: string; kind: (typeof entities)[number]['kind'] }>> {
	const output: Array<Readonly<{ id: string; kind: (typeof entities)[number]['kind'] }>> = [];
	for (const entity of sourceEntities(entities)) output.push({ id: entity.id, kind: entity.kind });
	return output;
}

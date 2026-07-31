import type { ExactRuntimeInspectionCorrelation } from '../types.js';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import type { ExactSourceInspection } from './contracts.js';

/** Derives compact runtime slots from the same canonical source entities used by language tools. */
export function createExactRuntimeInspectionCorrelation(
	inspection: ExactSourceInspection,
	redactions?: ExactInspectionRedactionCatalog
): ExactRuntimeInspectionCorrelation {
	return Object.freeze({
		protocol: 1,
		...(redactions ? { redactions: freezeRedactions(redactions) } : {}),
		components: Object.freeze(
			inspection.components.map((component) =>
				Object.freeze({
					componentTypeId: component.id,
					slots: Object.freeze(flattenEntitySlots(component.children))
				})
			)
		)
	});
}

function freezeRedactions(
	redactions: ExactInspectionRedactionCatalog
): ExactInspectionRedactionCatalog {
	return Object.freeze({
		statePaths: Object.freeze([...redactions.statePaths]),
		contextTokens: Object.freeze(
			redactions.contextTokens.map((token) => Object.freeze({ ...token }))
		),
		secretNames: Object.freeze([...redactions.secretNames])
	});
}

/**
 * Appends an inert registration for an optional page-world inspector.
 *
 * The payload contains identity only. It deliberately omits source paths,
 * classifications, reasons, diagnostics, and authored text.
 */
export function appendExactRuntimeInspectionRegistration(
	code: string,
	correlation: ExactRuntimeInspectionCorrelation
): string {
	const payload = JSON.stringify(correlation);
	return `${code}
;{
	const key = Symbol.for('@exactjs/devtools-runtime');
	const runtime = globalThis[key] ??= {
		sources: [],
		registerSource(value) { this.sources.push(value); }
	};
	runtime.registerSource(${payload});
}
`;
}

function flattenEntitySlots(
	entities: ExactSourceInspection['components'][number]['children']
): Array<Readonly<{ id: string; kind: (typeof entities)[number]['kind'] }>> {
	const output: Array<Readonly<{ id: string; kind: (typeof entities)[number]['kind'] }>> = [];
	for (const entity of entities) {
		output.push(
			Object.freeze({ id: entity.id, kind: entity.kind }),
			...flattenEntitySlots(entity.children)
		);
	}
	return output;
}

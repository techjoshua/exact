import type {
	ExactInspectionFilter,
	ExactInspectionExecutionRoot,
	ExactInspectionRuntimeId
} from '@exactjs/devtools-protocol';

/** Matches the ownership coordinates available on an execution-root record. */
export function matchesInspectionRoot(
	root: Pick<ExactInspectionExecutionRoot, 'side' | 'binding' | 'buildKey' | 'executionRoot'>,
	filter: ExactInspectionFilter | undefined
): boolean {
	for (const key of ['side', 'binding', 'buildKey', 'executionRoot'] as const)
		if (filter?.[key] !== undefined && root[key] !== filter[key]) return false;
	return true;
}

/** Matches component ownership without interpreting timeline-only filters. */
export function matchesInspectionComponent(
	identity: ExactInspectionRuntimeId,
	filter: ExactInspectionFilter | undefined
): boolean {
	if (!matchesInspectionRoot(identity, filter)) return false;
	for (const key of ['componentTypeId', 'instanceId'] as const)
		if (filter?.[key] !== undefined && identity[key] !== filter[key]) return false;
	return true;
}

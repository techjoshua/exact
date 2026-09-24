import type { ExactInvocationRequest } from '@exactjs/core/framework/operation-protocol';

/** Checks compiler-owned operation identity independently of the response transport. */
export function matchesOperation(
	record: Record<string, unknown>,
	expected: ExactInvocationRequest
): boolean {
	return (
		record.type === expected.type && record.id === expected.id && record.opId === expected.opId
	);
}

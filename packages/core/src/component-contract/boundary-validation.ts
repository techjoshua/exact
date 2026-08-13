import type { ExactComponentBoundaryContract } from '../component-contracts.js';
import {
	hasOnlyContractKeys,
	isContractRecord,
	isContractString,
	isSafeContractStringList
} from './metadata-validation.js';

/** Validates generated boundary metadata, including the exact partition authority shape. */
export function isExactComponentBoundaryContract(
	value: unknown
): value is ExactComponentBoundaryContract {
	if (!isContractRecord(value)) return false;
	return (
		hasOnlyContractKeys(value, [
			'id',
			'componentId',
			'ownerComponentId',
			'kind',
			'planVersion',
			'buildKey',
			'planEdgeId',
			'parentPlanId',
			'fallbackPlanId',
			'patchTargets',
			'discriminatorKind',
			'discriminatorValues',
			'generation'
		]) &&
		isContractString(value.id) &&
		typeof value.componentId === 'string' &&
		(value.componentId.length > 0 ||
			value.kind === 'client-island' ||
			value.kind === 'server-slot') &&
		isContractString(value.ownerComponentId) &&
		isContractString(value.kind) &&
		(value.planVersion === undefined ||
			(Number.isSafeInteger(value.planVersion) && (value.planVersion as number) > 0)) &&
		(value.buildKey === undefined || isContractString(value.buildKey)) &&
		(value.planEdgeId === undefined || isContractString(value.planEdgeId)) &&
		(value.parentPlanId === undefined || isContractString(value.parentPlanId)) &&
		(value.fallbackPlanId === undefined || isContractString(value.fallbackPlanId)) &&
		(value.patchTargets === undefined || isSafeContractStringList(value.patchTargets)) &&
		(value.discriminatorKind === undefined ||
			value.discriminatorKind === 'single' ||
			value.discriminatorKind === 'branch' ||
			value.discriminatorKind === 'keyed') &&
		(value.discriminatorValues === undefined ||
			isSafeContractStringList(value.discriminatorValues)) &&
		(value.generation === undefined ||
			(Number.isSafeInteger(value.generation) && (value.generation as number) > 0)) &&
		validPartitionBoundaryFields(value)
	);
}

function validPartitionBoundaryFields(value: Record<string, unknown>): boolean {
	if (value.kind !== 'partition-range') return value.planVersion === undefined;
	if (
		value.planVersion !== 1 ||
		!isContractString(value.buildKey) ||
		!isContractString(value.planEdgeId) ||
		!isContractString(value.parentPlanId) ||
		!isContractString(value.fallbackPlanId) ||
		!isSafeContractStringList(value.patchTargets) ||
		!value.patchTargets.includes(value.planEdgeId) ||
		!isSafeContractStringList(value.discriminatorValues) ||
		!Number.isSafeInteger(value.generation) ||
		(value.generation as number) < 1
	)
		return false;
	if (value.discriminatorKind === 'single') return value.discriminatorValues.length === 0;
	if (value.discriminatorKind === 'branch') return value.discriminatorValues.length > 0;
	return value.discriminatorKind === 'keyed';
}

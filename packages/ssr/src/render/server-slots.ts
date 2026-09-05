import type { ExactServerSlotReceiptData } from '@exactjs/core/runtime/component-abi';
import { escapeAttr } from '../html.js';
import type { SsrContext } from '../types.js';

/** Static authority attached to one compiler-planned server slot. */
export type ExactServerSlotReference = Readonly<{
	id: string;
	planVersion?: number;
	buildKey?: string;
	planEdgeId?: string;
	ownerComponentId?: string;
	discriminator?:
		| Readonly<{ kind: 'single' }>
		| Readonly<{ kind: 'branch'; branch: string }>
		| Readonly<{ kind: 'keyed'; list: string; keyToken: string }>;
	generation?: number;
}>;

/** Returns the generated child slot identity for a server boundary. */
export function serverSlotId(boundaryId: string): string {
	return `${boundaryId}:children`;
}

/** Creates the serializable reference carried by a server boundary prop. */
export function serverSlotPayload(
	slot: ExactServerSlotReference,
	context: Pick<SsrContext, 'executionRoot'>
): Record<string, unknown> {
	return slot.planVersion === undefined
		? { __exactServerSlot: slot.id }
		: {
				__exactServerSlot: slot.id,
				planVersion: slot.planVersion,
				buildKey: slot.buildKey,
				executionRoot: context.executionRoot,
				planEdgeId: slot.planEdgeId,
				ownerComponentId: slot.ownerComponentId,
				discriminator: slot.discriminator,
				generation: slot.generation
			};
}

/** Validates one opaque compiler-owned retained server-range operation. */
export function serverSlotReceiptReference(
	receipt: ExactServerSlotReceiptData
): ExactServerSlotReference {
	const candidate = {
		__exactServerSlot: receipt.id,
		planVersion: receipt.planVersion,
		buildKey: receipt.buildKey,
		planEdgeId: receipt.planEdgeId,
		ownerComponentId: receipt.ownerComponentId,
		discriminator: receipt.discriminator,
		generation: receipt.generation
	};
	if (!serverSlotReference(candidate))
		throw new Error('Compiler-planned server range has malformed runtime authority');
	return {
		id: receipt.id,
		planVersion: receipt.planVersion as number,
		buildKey: receipt.buildKey as string,
		planEdgeId: receipt.planEdgeId as string,
		ownerComponentId: receipt.ownerComponentId as string,
		discriminator: receipt.discriminator as NonNullable<ExactServerSlotReference['discriminator']>,
		generation: receipt.generation as number
	};
}

/** Reports whether a value carries a valid compiler-owned server-slot authority record. */
export function serverSlotReference(value: unknown): value is ExactServerSlotReference | string {
	if (typeof value === 'string') return value.length > 0;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const slot = value as Record<string, unknown>;
	return (
		typeof slot.__exactServerSlot === 'string' &&
		slot.__exactServerSlot.length > 0 &&
		slot.planVersion === 1 &&
		typeof slot.buildKey === 'string' &&
		slot.buildKey.length > 0 &&
		(slot.planEdgeId === slot.__exactServerSlot ||
			(validServerSlotDiscriminator(slot.discriminator) &&
				(slot.discriminator as Record<string, unknown>).kind === 'keyed' &&
				slot.__exactServerSlot.startsWith(`${slot.planEdgeId}:key:`))) &&
		typeof slot.ownerComponentId === 'string' &&
		slot.ownerComponentId.length > 0 &&
		validServerSlotDiscriminator(slot.discriminator) &&
		Number.isSafeInteger(slot.generation) &&
		(slot.generation as number) > 0
	);
}

function validServerSlotDiscriminator(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const discriminator = value as Record<string, unknown>;
	if (discriminator.kind === 'single') return Object.keys(discriminator).length === 1;
	if (discriminator.kind === 'branch')
		return (
			Object.keys(discriminator).length === 2 &&
			typeof discriminator.branch === 'string' &&
			!!discriminator.branch
		);
	return (
		discriminator.kind === 'keyed' &&
		Object.keys(discriminator).length === 3 &&
		typeof discriminator.list === 'string' &&
		!!discriminator.list &&
		typeof discriminator.keyToken === 'string' &&
		!!discriminator.keyToken
	);
}

/** Emits the compact runtime authority tuple on one retained server range. */
export function serverSlotOpening(
	slot: ExactServerSlotReference,
	context: Pick<SsrContext, 'executionRoot' | 'buildKey'>
): string {
	if (slot.buildKey && context.buildKey && slot.buildKey !== context.buildKey)
		throw new Error('Client boundary partition slot build does not match the SSR build');
	const discriminator = slot.discriminator;
	const authority =
		slot.planVersion === undefined
			? ''
			: ` data-exact-partition-version="${slot.planVersion}" data-exact-partition-build="${escapeAttr(slot.buildKey!)}" data-exact-partition-root="${escapeAttr(context.executionRoot)}" data-exact-partition-edge="${escapeAttr(slot.planEdgeId!)}" data-exact-partition-owner="${escapeAttr(slot.ownerComponentId!)}" data-exact-partition-discriminator="${discriminator!.kind}"${discriminator?.kind === 'branch' ? ` data-exact-partition-branch="${escapeAttr(discriminator.branch)}"` : ''}${discriminator?.kind === 'keyed' ? ` data-exact-partition-list="${escapeAttr(discriminator.list)}" data-exact-partition-key="${escapeAttr(discriminator.keyToken)}"` : ''} data-exact-partition-generation="${slot.generation}"`;
	return `<span data-exact-server-slot="${escapeAttr(slot.id)}"${authority} style="display: contents;">`;
}

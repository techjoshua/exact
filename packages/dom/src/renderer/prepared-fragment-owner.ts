import { type AdmittedClientComponentInput } from './component-input-admission.js';
import {
	withComponentDomain,
	type AnyComponentInstance,
	type Child,
	type EnhancementEntry
} from '@exactjs/core';
import { readPreparedTargetOutput } from '@exactjs/core/framework/render-structure';
import {
	createChildRangeReceipt,
	withCompiledTargetPresentation
} from '@exactjs/core/runtime/component-operations';
import { computed, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { prepareComponentReceipt } from './prepare-component-receipt.js';
import type { PreparedComponentAttachment } from './prepared-component-attachment.js';

/** One durable transparent contributor and its current supplied placement. */
export interface PreparedOwner {
	identity: symbol;
	attachment: PreparedComponentAttachment;
	instance: AnyComponentInstance;
	output: readonly Child[];
	child: Child;
	tag?: string;
	mounted: Mounted;
	operation: Child;
	entry: EnhancementEntry;
}

/** Prepares one owner once and registers its contribution-free native placement for commit. */
export function prepareFragmentOwner(
	root: Root,
	operation: Child,
	receipt: AdmittedClientComponentInput,
	child: Child,
	entry: EnhancementEntry,
	parent: AnyComponentInstance | undefined,
	scope: EffectScope,
	parentNode: Node | undefined,
	pending: NonNullable<Root['preparedComponents']>,
	tag?: string,
	mode: 'mount' | 'hydrate' = 'mount'
): PreparedOwner {
	const attachment = prepareComponentReceipt(root, receipt, parent, scope, parentNode, mode);
	try {
		const owner: PreparedOwner = {
			identity: Symbol(entry.identity),
			attachment,
			instance: attachment.owner,
			output: attachment.output,
			child,
			mounted: attachment.ownedRange,
			operation,
			entry,
			tag
		};
		readPreparedTargetOutput(owner.output, child);
		pending.append({
			operation: receipt.admitted.operation,
			parent,
			attachment,
			project: (output) => [
				createChildRangeReceipt(
					computed(() =>
						withComponentDomain(owner.instance.domain, () => {
							const contribution = readPreparedTargetOutput(output, owner.child);
							return contribution
								? withCompiledTargetPresentation(contribution.operation, ...contribution.children)
								: [...output];
						})
					)
				)
			]
		});
		return owner;
	} catch (error) {
		attachment.abort();
		throw error;
	}
}

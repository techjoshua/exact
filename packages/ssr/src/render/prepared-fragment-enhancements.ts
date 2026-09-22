import {
	pageComponentDomain,
	withComponentDomain,
	type AnyComponentInstance,
	type Child,
	type EnhancementEntry
} from '@exactjs/core';
import {
	assertEnhancementSourceOrder,
	FragmentPresentationHosts,
	readPreparedTargetOutput
} from '@exactjs/core/framework/render-structure';
import {
	createChildRangeReceipt,
	createCompiledComponentReceipt,
	createCompiledFragmentPresentation,
	createCompiledFragmentReceipt,
	createCompiledTargetReceipt,
	readCompiledComponentReceipt,
	readCompiledFragmentReceipt,
	type ExactTargetReceiptData
} from '@exactjs/core/runtime/component-operations';
import { reactive } from '@exactjs/reactive';
import { computed, createEffectScope, withEffectScope } from '@exactjs/reactive/framework/runtime';
import type { SsrContext } from '../types.js';
import { renderChildren } from './children.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { withRenderCleanup, type RenderValue } from './execution.js';
import { captureSsrProgramOutput } from './program-capture.js';

/**
 * Buffers one prepared fragment chain while normal request-owned component execution supplies its
 * contributions. Each sink retains its component until descendant output settles. No second
 * component execution or DOM-shaped server tree is introduced; ordinary publication owns markers,
 * resumptions, scheduled retries, and cleanup. Transparent contributors share planned hosts.
 */
export function renderPreparedFragmentEnhancements(
	context: SsrContext,
	entries: readonly EnhancementEntry[],
	target: Child,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	tags: ReadonlyMap<string, string> = new Map()
): RenderValue<string> {
	if (!readCompiledFragmentReceipt(target))
		throw new TypeError('Prepared fragment attachment requires a resolved fragment');
	assertEnhancementSourceOrder(entries, context.enhancementCatalog ?? new Map());
	const scope = createEffectScope();
	const hosts = new FragmentPresentationHosts();
	const owners: Array<{
		identity: symbol;
		contribution?: ExactTargetReceiptData;
		tag?: string;
	}> = [];
	const records: object[] = [];
	const ownerInstances = new Map<symbol, AnyComponentInstance | undefined>();
	const generation = reactive({ value: 0 });
	const projections = (context.preparedComponentOutputs ??= new WeakMap());
	return withRenderCleanup(
		() =>
			withEffectScope(scope, () =>
				withComponentDomain(parent?.domain ?? pageComponentDomain, () => {
					const leaf = createChildRangeReceipt(
						computed(() => {
							void generation.value;
							return createCompiledFragmentPresentation(
								target,
								hosts
									.reconcile(
										owners.flatMap((owner) =>
											owner.contribution
												? [
														{
															owner: owner.identity,
															props: owner.contribution.props,
															declaredHostProps: owner.contribution.declaredHostProps,
															tag: owner.tag
														}
													]
												: []
										)
									)
									.map((host) => ({
										identity: host.identity,
										tag: host.tag,
										contributions: host.owners.map((contribution) => ({
											identity: contribution.owner,
											props: contribution.props,
											owner: ownerInstances.get(contribution.owner)
										}))
									}))
							);
						})
					);
					let chain: Child = leaf;
					for (let index = entries.length - 1; index >= 0; index--) {
						const entry = entries[index]!;
						const component = context.enhancementCatalog?.get(entry.identity);
						if (!component)
							throw new Error(`Prepared enhancement is unavailable: ${entry.identity}`);
						const child = chain;
						chain = createCompiledComponentReceipt(component, { ...entry.props }, child);
						const receipt = readCompiledComponentReceipt(chain)!;
						const record: (typeof owners)[number] = {
							identity: Symbol(entry.identity),
							tag: entry.intrinsicFragment ?? tags.get(entry.identity)
						};
						owners.unshift(record);
						records.push(receipt);
						projections.set(receipt, (content, owner) => {
							if (!content.children)
								throw new TypeError(
									'Fragment contribution preparation requires ordinary prepared output'
								);
							const contribution = readPreparedTargetOutput(content.children, child);
							record.contribution = contribution;
							ownerInstances.set(record.identity, owner);
							generation.value++;
							return {
								children: [
									createChildRangeReceipt(
										contribution
											? createCompiledTargetReceipt(null, ...contribution.children)
											: content.children
									)
								]
							};
						});
					}
					return captureSsrProgramOutput(context, () =>
						renderChildren(
							context,
							[createCompiledFragmentReceipt(null, chain)],
							parent,
							options,
							true
						)
					);
				})
			),
		() => {
			for (const record of records) projections.delete(record);
			hosts.dispose();
			scope.stop();
		}
	);
}

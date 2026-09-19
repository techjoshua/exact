import { movePreparedEnhancement } from './prepared-enhancement-move.js';
import {
	attachSuppressedCleanupFailure,
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
	readCompiledComponentReceipt,
	readCompiledFragmentReceipt,
	withTransparentComponentUpdateOwner
} from '@exactjs/core/runtime/component-operations';
import {
	computed,
	createEffectScope,
	registerEffectScopeCleanup,
	withEffectScope,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { reactive } from '@exactjs/reactive';
import { removePreparedEnhancement } from './prepared-enhancement-removal.js';
import { mountDetachedOperation } from './mounting/children.js';
import { prepareFragmentOwner, type PreparedOwner } from './prepared-fragment-owner.js';
import { insertPreparedEnhancement } from './prepared-enhancement-insertion.js';

/**
 * Prepares a chain of transparent fragment contributors in context order before placing any of
 * its output. Each component executes once. The shared host plan owns separate contribution
 * records and retains the original fragment across topology changes. Structural wrappers require
 * their own preparation boundary and are rejected here before native publication.
 */
export function mountPreparedFragmentEnhancements(
	root: Root,
	entries: readonly EnhancementEntry[],
	target: Child,
	parent: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	parentNode?: Node,
	tags: ReadonlyMap<string, string> = new Map(),
	hydration?: { attach(output: Child, scope: EffectScope): Mounted }
): Mounted {
	if (!readCompiledFragmentReceipt(target))
		throw new TypeError('Prepared fragment attachment requires a resolved fragment');
	assertEnhancementSourceOrder(entries, root.enhancementCatalog ?? new Map());
	const scope = createEffectScope(parentScope);
	const domain = parent?.domain ?? root.domain ?? pageComponentDomain;
	const owners: PreparedOwner[] = [];
	const ownerInstances = new Map<symbol, AnyComponentInstance>();
	const hosts = new FragmentPresentationHosts();
	const revision = reactive({ value: 0 });
	let currentTarget = target;
	registerEffectScopeCleanup(scope, () => hosts.dispose());
	const previous = root.preparedComponents;
	const pending = new Map(previous);
	try {
		return withEffectScope(scope, () =>
			withComponentDomain(domain, () => {
				const leaf = createChildRangeReceipt(
					computed(() =>
						withComponentDomain(domain, () => {
							void revision.value;
							const required = owners.flatMap((owner) => {
								const contribution = readPreparedTargetOutput(owner.output, owner.child);
								return contribution
									? [
											{
												owner: owner.identity,
												props: contribution.props,
												declaredHostProps: contribution.declaredHostProps,
												tag: owner.tag
											}
										]
									: [];
							});
							return createCompiledFragmentPresentation(
								currentTarget,
								hosts.reconcile(required).map((host) => ({
									identity: host.identity,
									tag: host.tag,
									contributions: host.owners.map((contribution) => ({
										identity: contribution.owner,
										props: contribution.props,
										owner: ownerInstances.get(contribution.owner)!
									}))
								}))
							);
						})
					)
				);
				let chain: Child = leaf;
				const receipts = [];
				for (let index = entries.length - 1; index >= 0; index--) {
					const entry = entries[index]!;
					const component = root.enhancementCatalog?.get(entry.identity);
					if (!component) throw new Error(`Prepared enhancement is unavailable: ${entry.identity}`);
					const child = chain;
					chain = withTransparentComponentUpdateOwner(
						createCompiledComponentReceipt(component, { ...entry.props }, child)
					);
					receipts.unshift({
						operation: chain,
						receipt: readCompiledComponentReceipt(chain)!,
						child,
						entry
					});
				}
				let contextOwner = parent;
				let contextScope = scope;
				for (const { operation, receipt, child, entry } of receipts) {
					const owner = prepareFragmentOwner(
						root,
						operation,
						receipt,
						child,
						entry,
						contextOwner,
						contextScope,
						parentNode,
						pending,
						entry.intrinsicFragment ?? tags.get(entry.identity),
						hydration ? 'hydrate' : 'mount'
					);
					owners.push(owner);
					ownerInstances.set(owner.identity, owner.instance);
					contextOwner = owner.instance;
					contextScope = owner.mounted.scope;
				}
				root.preparedComponents = pending;
				const output = createCompiledFragmentReceipt(null, chain);
				const mounted = hydration
					? hydration.attach(output, scope)
					: mountDetachedOperation(root, output, parent, scope, parentNode);
				mounted.scope = scope;
				mounted.receivePreparedEnhancements = (nextEntries, nextTarget) => {
					if (!nextEntries.length) return false;
					const retained = new Map(owners.map((owner) => [owner.entry.identity, owner]));
					const nextSet = new Set(
						nextEntries.flatMap((entry) => {
							const owner = retained.get(entry.identity);
							return owner && owner.entry.intrinsicFragment === entry.intrinsicFragment
								? [owner]
								: [];
						})
					);
					const parents = new Map<PreparedOwner, AnyComponentInstance | undefined>();
					let previousOwner = parent;
					for (const owner of owners) {
						parents.set(owner, previousOwner);
						if (nextSet.has(owner)) previousOwner = owner.instance;
					}
					assertEnhancementSourceOrder(nextEntries, root.enhancementCatalog ?? new Map());
					for (let index = owners.length - 1; index >= 0; index--) {
						const owner = owners[index]!;
						if (nextSet.has(owner)) continue;
						removePreparedEnhancement(
							root,
							mounted,
							owner.mounted,
							owner.child,
							parents.get(owner)
						);
						const preceding = owners[index - 1];
						if (preceding) preceding.child = owner.child;
						owners.splice(index, 1);
						ownerInstances.delete(owner.identity);
					}
					for (let index = 0; index < nextEntries.length; index++) {
						const entry = nextEntries[index]!;
						if (owners[index]?.entry.identity === entry.identity) continue;
						const predecessor = owners[index - 1];
						const child = owners[index]?.operation ?? leaf;
						const existingIndex = owners.findIndex(
							(owner) => owner.entry.identity === entry.identity
						);
						if (existingIndex >= 0) {
							const moving = owners[existingIndex]!;
							const oldPredecessor = owners[existingIndex - 1];
							movePreparedEnhancement(
								root,
								mounted,
								moving,
								child,
								oldPredecessor?.instance ?? parent,
								predecessor?.instance ?? parent
							);
							if (oldPredecessor) oldPredecessor.child = moving.child;
							owners.splice(existingIndex, 1);
							owners.splice(index, 0, moving);
							continue;
						}
						const operation = withComponentDomain(domain, () =>
							withTransparentComponentUpdateOwner(
								createCompiledComponentReceipt(
									root.enhancementCatalog!.get(entry.identity)!,
									{ ...entry.props },
									child
								)
							)
						);
						const pendingInsertion = new Map(root.preparedComponents);
						const added = prepareFragmentOwner(
							root,
							operation,
							readCompiledComponentReceipt(operation)!,
							child,
							entry,
							predecessor?.instance ?? parent,
							predecessor?.mounted.scope ?? scope,
							parentNode,
							pendingInsertion,
							entry.intrinsicFragment ?? tags.get(entry.identity)
						);
						try {
							insertPreparedEnhancement(
								root,
								mounted,
								operation,
								child,
								predecessor?.instance ?? parent,
								pendingInsertion
							);
						} catch (error) {
							added.attachment.abort();
							throw error;
						}
						owners.splice(index, 0, added);
						ownerInstances.set(added.identity, added.instance);
					}
					for (let index = 0; index < owners.length; index++) {
						const owner = owners[index]!;
						owner.child = owners[index + 1]?.operation ?? leaf;
						owner.entry = nextEntries[index]!;
						owner.mounted.clientArtifact!.receive(owner.instance, nextEntries[index]!.props, [
							owner.child
						]);
					}
					currentTarget = nextTarget;
					revision.value++;
					return true;
				};
				return mounted;
			})
		);
	} catch (error) {
		for (const owner of [...owners].reverse()) {
			try {
				owner.attachment.abort();
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
		}
		try {
			scope.stop();
		} catch (cleanup) {
			attachSuppressedCleanupFailure(error, cleanup);
		}
		throw error;
	} finally {
		root.preparedComponents = previous;
	}
}

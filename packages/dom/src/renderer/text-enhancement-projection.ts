import { readExactEnhancementContexts, type Child } from '@exactjs/core';
import { exactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import {
	FragmentPresentationHosts,
	readPreparedTargetOutput,
	type FragmentContribution,
	type PreparedTextResolver
} from '@exactjs/core/framework/render-structure';
import {
	createCompiledComponentReceipt,
	readCompiledComponentReceipt,
	readCompiledFragmentReceipt,
	createCompiledFragmentPresentation
} from '@exactjs/core/runtime/component-operations';
import type { Root } from '../types.js';
import type { TextComponentVisitor } from './enhancement-capability.js';
import {
	withoutEnhancements,
	childEnhancementEntries,
	createEnhancementChain,
	orderEnhancementEntries
} from './enhancement-chain.js';
import {
	withPreparedEnhancementBindings,
	preparedEnhancementEntries,
	consumePreparedEnhancementBinding
} from './prepared-output-bindings.js';

/** Prepares enhancement owners without publishing fake Elements inside a text-only host. */
export function createTextEnhancementProjection(
	root: Root,
	component: TextComponentVisitor
): PreparedTextResolver {
	const plans = new WeakMap<object, { leaf: Child; hosts: FragmentPresentationHosts }>();
	const identities = new WeakMap<object, symbol>();
	return (value, project) => {
		if (typeof value !== 'object' || value === null) return undefined;
		root.enhancementCatalog ??= exactEnhancementCatalog;
		const receipt = readCompiledComponentReceipt(value);
		if (receipt)
			return component(receipt, (output, mounted) =>
				withPreparedEnhancementBindings(root, mounted, [...output], project)
			);
		const entries = orderEnhancementEntries(root, preparedEnhancementEntries(root, value as Child));
		if (!entries.length)
			return childEnhancementEntries(value as Child).length
				? project([withoutEnhancements(value as Child)])
				: undefined;
		return consumePreparedEnhancementBinding(root, value as Child, () => {
			let plan = plans.get(value);
			if (!plan) {
				plan = {
					leaf: withoutEnhancements(value as Child),
					hosts: new FragmentPresentationHosts()
				};
				plans.set(value, plan);
			}
			const { leaf, hosts } = plan;
			if (!entries.length) return project([leaf]);
			if (
				!readCompiledFragmentReceipt(leaf) ||
				!entries.every(
					(entry) =>
						readExactEnhancementContexts(root.enhancementCatalog!.get(entry.identity)!)
							?.transparentTarget
				)
			)
				return project([createEnhancementChain(root, entries, leaf)]);
			const contributions: FragmentContribution[] = [];
			const owners = new Map<
				symbol,
				Parameters<Parameters<TextComponentVisitor>[1]>[1]['instance']
			>();
			const visit = (index: number): string => {
				if (index === entries.length)
					return project([
						createCompiledFragmentPresentation(
							leaf,
							hosts.reconcile(contributions).map((host) => ({
								identity: host.identity,
								tag: host.tag,
								contributions: host.owners.map((fact) => ({
									identity: fact.owner,
									props: fact.props,
									owner: owners.get(fact.owner)
								}))
							}))
						)
					]);
				const entry = entries[index]!;
				const receipt = createCompiledComponentReceipt(
					root.enhancementCatalog!.get(entry.identity)!,
					{ ...entry.props },
					leaf
				);
				return component(readCompiledComponentReceipt(receipt)!, (output, mounted) => {
					const contribution = readPreparedTargetOutput(output, leaf);
					let identity = identities.get(mounted);
					if (!identity) {
						identity = Symbol('text contribution');
						identities.set(mounted, identity);
					}
					owners.set(identity, mounted.instance);
					contributions.push({
						owner: identity,
						tag: entry.intrinsicFragment,
						props: contribution?.props ?? {},
						declaredHostProps: contribution?.declaredHostProps
					});
					return visit(index + 1);
				});
			};
			return visit(0);
		});
	};
}

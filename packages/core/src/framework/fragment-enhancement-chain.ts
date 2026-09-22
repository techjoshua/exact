import type { AnyComponentFunction, Child, EnhancementEntry } from '../component/contracts.js';
import { createEnhancementNode, readExactEnhancementContexts } from '../enhancements.js';
import {
	createCompiledComponentReceipt,
	withFragmentEnhancementTarget,
	withTransparentComponentUpdateOwner
} from '../component-abi/receipt.js';
import { createCompiledFragmentReceipt } from '../component-abi/fragment-receipt.js';

/** Builds source-ordered fragment peers, grouping transparent runs without crossing authored structure. */
export function createFragmentEnhancementChain(
	entries: readonly EnhancementEntry[],
	target: Child,
	catalog: ReadonlyMap<string, AnyComponentFunction>,
	transparentUpdates = false
): Child {
	let chain = target;
	for (let index = entries.length - 1; index >= 0; ) {
		const entry = entries[index]!;
		const component = catalog.get(entry.identity)!;
		if (readExactEnhancementContexts(component)?.transparentTarget) {
			let start = index;
			while (
				start > 0 &&
				readExactEnhancementContexts(catalog.get(entries[start - 1]!.identity)!)?.transparentTarget
			)
				start--;
			chain = createCompiledFragmentReceipt(
				{ __exactEnhancements: createEnhancementNode(entries.slice(start, index + 1)) },
				chain
			);
			index = start - 1;
		} else {
			let receipt = withFragmentEnhancementTarget(
				createCompiledComponentReceipt(component, { ...entry.props }, chain),
				chain,
				entry.intrinsicFragment
			);
			if (transparentUpdates) receipt = withTransparentComponentUpdateOwner(receipt);
			chain = receipt;
			index--;
		}
	}
	return chain;
}

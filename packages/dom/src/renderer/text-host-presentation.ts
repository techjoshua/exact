import type { AnyComponentInstance, Child } from '@exactjs/core';
import { reactiveObjects } from '@exactjs/reactive/framework/objects';
import { createEffectScope, watch, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { placeMountedBefore } from '../placement.js';
import { TextComponentProjection } from './text-component-projection.js';
import { unmountMounted } from './teardown.js';

/** One retained aggregate binding for a native text-only host and its component owners. */
export type TextHostPresentation = { receive(children: readonly Child[]): void };

/**
 * Owns one Text node while nested native components retain their scopes and context parentage.
 * Adoption validates parser-coalesced text before publication. Updates preserve dirty textarea
 * values because they modify default text, never the control's live value property.
 */
export function mountTextHostPresentation(
	root: Root,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	existing?: Text
): Mounted {
	const scope = createEffectScope(parentScope);
	const text = existing ?? document.createTextNode('');
	const mounted: Mounted = { scalar: true, dom: text, scope, children: [] };
	const projection = new TextComponentProjection(root, mounted, text, parent);
	const revision = reactiveObjects({ value: 0 });
	let current = children;
	let initial = true;
	try {
		watch(
			() => {
				void revision.value;
				const value = projection.read(current);
				if (initial && existing && text.data !== value)
					throw new Error('Text host output does not match server text');
				if (text.data !== value) text.data = value;
				mounted.scalarValue = value;
				if (!initial && text.parentNode)
					placeMountedBefore(root, text.parentNode, mounted, text.nextSibling);
				initial = false;
			},
			undefined,
			{ scope }
		);
		mounted.textHostPresentation = {
			receive(next) {
				current = next;
				revision.value++;
			}
		};
		return mounted;
	} catch (error) {
		unmountMounted(mounted);
		throw error;
	}
}

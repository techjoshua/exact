import { normalizeRenderResult, type AnyComponentInstance, type RenderResult } from '@exactjs/core';
import {
	placeCompatibilityContribution,
	type ExactCompatibilityContribution
} from '@exactjs/core/framework/compatibility-contributions';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { placeMountedBefore } from '../placement.js';
import type { Mounted, Root } from '../types.js';
import { createRendererRoot } from './root-construction.js';
import { mountDetachedChildren } from './mounting/children.js';
import { patchChildren } from './patching/children.js';
import { unmountMany } from './teardown.js';

/** Opaque native ownership supplied to a foreign renderer's range carrier. */
export type ExactCompatibilityRangeHost = object;

/** Foreign-owned controller for one native range; its interior remains private to DOM. */
export type ExactCompatibilityRange = Readonly<{
	start: Node;
	end: Node;
	update(contribution: ExactCompatibilityContribution): void;
	dispose(): void;
}>;

type CompatibilityRangeHostData = {
	root: Root;
	parentInstance?: AnyComponentInstance;
	parentScope?: EffectScope;
};

const hosts = new WeakMap<object, CompatibilityRangeHostData>();

/** Creates the native ownership needed by contributions inside a standalone React root. */
export function createStandaloneCompatibilityRangeHost(
	container: Element
): ExactCompatibilityRangeHost {
	const host = {};
	hosts.set(host, {
		root: createRendererRoot(container, null, {}, { version: 1 })
	});
	return host;
}

/** Creates the native ownership inherited by a React island inside an eXact component. */
export function createNestedCompatibilityRangeHost(
	root: Root,
	parentInstance: AnyComponentInstance,
	parentScope: EffectScope
): ExactCompatibilityRangeHost {
	const host = {};
	hosts.set(host, { root, parentInstance, parentScope });
	return host;
}

/** Places one opaque native supplier operation into a React-owned physical range. */
export function mountCompatibilityRange(
	host: ExactCompatibilityRangeHost,
	contribution: ExactCompatibilityContribution,
	parent: Node,
	before: Node | null
): ExactCompatibilityRange {
	const owner = hosts.get(host);
	if (!owner) throw new TypeError('Invalid native compatibility range host');
	const scope = createEffectScope(owner.parentScope);
	const document = parent.ownerDocument ?? globalThis.document;
	const start = document.createTextNode('');
	const end = document.createTextNode('');
	parent.insertBefore(start, before);
	parent.insertBefore(end, before);
	let children: Mounted[] = [];
	let active = true;
	const place = (next: ExactCompatibilityContribution, initial: boolean): void => {
		placeCompatibilityContribution(next, {
			place(value) {
				const normalized = normalizeRenderResult(value as RenderResult);
				children = initial
					? mountDetachedChildren(owner.root, normalized, owner.parentInstance, scope, parent)
					: patchChildren(
							owner.root,
							parent,
							children,
							normalized,
							owner.parentInstance,
							scope,
							end
						);
				if (initial)
					for (const mounted of children) placeMountedBefore(owner.root, parent, mounted, end);
				return host;
			}
		});
	};
	place(contribution, true);
	return {
		start,
		end,
		update(next) {
			if (!active) throw new Error('Cannot update a disposed native compatibility range');
			place(next, false);
		},
		dispose() {
			if (!active) return;
			active = false;
			unmountMany(children);
			children = [];
			scope.stop();
			let current = start.nextSibling;
			while (current && current !== end) {
				const next = current.nextSibling;
				current.parentNode?.removeChild(current);
				current = next;
			}
			start.parentNode?.removeChild(start);
			end.parentNode?.removeChild(end);
		}
	};
}

import { currentComponentDomain, withComponentDomain, type Child } from '@exactjs/core';
import {
	createChildRangeReceipt,
	readChildRangeReceipt,
	readCompiledTargetReceipt
} from '@exactjs/core/runtime/component-operations';
import {
	computed,
	currentEffectScope,
	registerEffectScopeCleanup,
	unwrap
} from '@exactjs/reactive/framework/runtime';
import { FragmentPresentationHosts } from '@exactjs/core/framework/render-structure';
import { prototypeFragmentPlacement } from './supplied-target.js';

/**
 * Projects one prepared `_target` onto an already selected fragment. The caller supplies that
 * selection fact; this is not target discovery. Keeps reactive output in its original instance
 * scope and preserves the authored child operations instead of constructing them a second time.
 * This deliberately accepts only the single-boundary prototype, not arbitrary component output.
 */
export function preparedFragmentPresentation(output: readonly Child[], tag?: string): Child[] {
	const hosts = new FragmentPresentationHosts();
	const owner = Symbol('prepared fragment contribution');
	const scope = currentEffectScope();
	const domain = currentComponentDomain();
	if (!scope) throw new Error('Prepared fragment presentation requires an owning scope');
	if (!domain) throw new Error('Prepared fragment presentation requires an owning domain');
	registerEffectScopeCleanup(scope, () => hosts.dispose());
	return [
		createChildRangeReceipt(
			computed(() =>
				withComponentDomain(domain, () => {
					let value: unknown = output;
					for (;;) {
						value = unwrap(value);
						if (Array.isArray(value) && value.length === 1) {
							value = value[0];
							continue;
						}
						const range = readChildRangeReceipt(value);
						if (range && !range.dynamicComponent) {
							value = range.value;
							continue;
						}
						break;
					}
					const target = readCompiledTargetReceipt(value);
					if (!target || target.contributions)
						throw new TypeError(
							'Prepared fragment prototype requires one authored target boundary'
						);
					return prototypeFragmentPlacement(
						[...target.children],
						hosts.reconcile([{ owner, props: target.props, tag }])
					);
				})
			)
		)
	];
}

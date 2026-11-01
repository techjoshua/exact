import { rethrowComponentInputFailure } from '@exactjs/core/runtime/component-operations';
import { clientComponentInputProvider } from './component-input-admission.js';
import { normalizeChildren } from '@exactjs/core';
import { withComponentDomainSnapshot } from '@exactjs/core/framework/component-domains';
import { acquireComponentPropInputs } from '@exactjs/core/runtime/component-operations';
import {
	isCompiledPropOperand,
	readCompiledPropOperand
} from '@exactjs/reactive/framework/runtime';
import {
	clientComponentRecipe,
	type AdmittedClientComponentInput
} from './component-input-admission.js';
/** Acquires only compiler layers, preserving the exact authored reactive/callable result. */
export function componentReceiptInputs(receipt: AdmittedClientComponentInput) {
	const recipe = clientComponentRecipe(receipt.admitted);
	try {
		return withComponentDomainSnapshot(recipe.domain, () => {
			const props = acquireComponentPropInputs(
				recipe.props,
				!!recipe.update,
				recipe.contract.artifact.opaqueProps
			);
			const children =
				recipe.children.kind === 'reader' ? recipe.children.read() : recipe.children.values;

			const normalized = normalizeChildren(
				children.map((child) =>
					isCompiledPropOperand(child) ? readCompiledPropOperand(child) : child
				)
			);
			// An explicit empty reader must clear an earlier children prop, not delegate to it.
			if (recipe.children.kind === 'reader' && !normalized.length) normalized.push(undefined);
			return { props, children: normalized };
		});
	} catch (error) {
		rethrowComponentInputFailure(error, clientComponentInputProvider);
	}
}

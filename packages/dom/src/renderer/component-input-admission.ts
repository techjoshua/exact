import { componentContractVersion } from '../component-contract-version.js';
import {
	inspectComponentInput,
	redeemComponentInput,
	componentInputRecipe,
	type ExactAdmittedComponentInput,
	type ExactComponentInputRecipe
} from '@exactjs/core/runtime/component-operations';
/** Provider-owned admission facts, independent of the installed core's expected generation. */
export const clientComponentInputProvider = {
	version: componentContractVersion,
	target: 'client'
} as const;
/** Renderer-owned recipe view. Every effectful entrance revalidates its source operation. */
export type AdmittedClientComponentInput = ExactComponentInputRecipe &
	Readonly<{
		admitted: ExactAdmittedComponentInput<'client'>;
	}>;
/** Admits one required component before hydration capture, markers or component effects. */
export function admitCompiledComponentInput(
	operation: unknown
): ExactAdmittedComponentInput<'client'> {
	return redeemComponentInput(operation, clientComponentInputProvider);
}
/** Revalidates source identity rather than trusting a structural admitted brand or payload fields. */
export function clientComponentRecipe(
	admitted: ExactAdmittedComponentInput<'client'>
): AdmittedClientComponentInput {
	const recipe = componentInputRecipe(admitted, clientComponentInputProvider);
	return { ...recipe, admitted };
}
/** Selects a component without acquiring its child demand. Unknown old data cannot become a component. */
export function readClientComponentInput(
	operation: unknown
): AdmittedClientComponentInput | undefined {
	const identity = inspectComponentInput(operation);
	if (identity.kind === 'noncomponent') return undefined;
	return clientComponentRecipe(admitCompiledComponentInput(operation));
}

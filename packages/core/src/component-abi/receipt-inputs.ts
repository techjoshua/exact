import { rejectComponentInput, rethrowComponentInputFailure } from './input-errors.js';
export {
	isComponentInputIncompatibility,
	rethrowComponentInputFailure,
	type ExactComponentInputIncompatibility
} from './input-errors.js';
import { componentContractVersion } from '../component/contract-versions.js';
import type { Child, ComponentDomain, CompiledEnhancementNode } from '../component/contracts.js';
import {
	readPreparedExactExecutableComponentContract,
	type ExactExecutableComponentContract
} from '../component-contracts.js';
import type { AnyExactComponentCallable } from './executable-fields.js';
import type { ExactComponentReceipt, ExactComponentReceiptUpdate } from './receipt.js';
import {
	createOpaqueOperation,
	isOpaqueOperation,
	opaqueOperationInputGeneration,
	sharedOpaqueOperationStore
} from './opaque-operation.js';

/** Target independently selected by the consuming provider. */
export type ExactComponentTarget = 'client' | 'server';
/** Compiler-created child demand, separate from authored reactive payload values. */
export type ExactComponentChildrenInput =
	| Readonly<{ kind: 'eager'; values: readonly unknown[] }>
	| Readonly<{ kind: 'reader'; read: () => readonly Child[] }>;
/** Private recipe available only after matching-provider redemption. */
export type ExactComponentInputRecipe = Readonly<{
	contract: ExactExecutableComponentContract;
	props: Readonly<Record<string, unknown>>;
	children: ExactComponentChildrenInput;
	domain: ComponentDomain | undefined;
	key?: string;
	clientBoundaryId?: string;
	enhancement?: CompiledEnhancementNode;
	update?: ExactComponentReceiptUpdate;
	transparentUpdateOwner?: true;
	fragmentTarget?: Readonly<{ supplied: Child; tag: string }>;
}>;
declare const preparedReference: unique symbol;
/** Opaque server-local reference. Its input payload is not a public structural type. */
export type ExactPreparedServerComponentReference = object & {
	readonly [preparedReference]: never;
};
/** Independent generation and target asserted by the consuming renderer. */
export type ExactComponentInputProvider<T extends ExactComponentTarget> = Readonly<{
	version: typeof componentContractVersion;
	target: T;
}>;
declare const admittedInput: unique symbol;
/** Carries source identity, not self-authenticating structurally typed data. */
export type ExactAdmittedComponentInput<T extends ExactComponentTarget> = {
	readonly [admittedInput]: T;
} & (
	| Readonly<{ operation: ExactComponentReceipt | ExactPreparedServerComponentReference }>
	| (T extends 'server'
			? Readonly<{
					direct: Readonly<{
						type: AnyExactComponentCallable;
						props: Readonly<Record<string, unknown>>;
					}>;
				}>
			: never)
);
/** Stored identity facts, without props, child demand or a provider payload. */
export type ExactComponentInputInspection =
	| Readonly<{
			kind: 'component';
			generation: number;
			target: ExactComponentTarget;
			component: AnyExactComponentCallable;
			key: string | undefined;
			domain: ComponentDomain | undefined;
			clientBoundaryId: string | undefined;
			enhancement: CompiledEnhancementNode | undefined;
	  }>
	| Readonly<{ kind: 'unclassified-issued' }>
	| Readonly<{ kind: 'noncomponent' }>;
const preparedBrand = Symbol.for('@exactjs/prepared-server-component-reference/6');
const receipts =
	sharedOpaqueOperationStore<
		Readonly<{ recipe: ExactComponentInputRecipe; component: AnyExactComponentCallable }>
	>('component/input/6');
/** V6 dispatch carries only operation identity. The target must redeem before effects. */
export const exactComponentInputsOperationV6 = Symbol.for(
	'@exactjs/target-operation/component-input/6'
);
/** Component target whose independently generated provider admits an operation before use. */
export type ExactComponentInputsOperationTarget<Result = unknown> = Readonly<{
	[exactComponentInputsOperationV6](operation: ExactComponentReceipt): Result;
}>;
/** Checks the provider independently of any incoming operation identity. */
export function assertComponentInputProvider(
	provider: Readonly<{ version: number; target: ExactComponentTarget }>
): void {
	if (provider.version !== componentContractVersion)
		rejectComponentInput(provider, componentContractVersion);
}
/** Rejects missing/old descriptor generations before an opaque callback can execute. */
export function assertComponentOperationProvider<T extends ExactComponentTarget>(
	operation: object,
	provider: ExactComponentInputProvider<T>
): void {
	assertComponentInputProvider(provider);
	const generation = opaqueOperationInputGeneration(operation);
	if (generation !== provider.version)
		rejectComponentInput(provider, typeof generation === 'number' ? generation : undefined);
}
/** Reads inert identity facts without evaluating child demand or a deferred key. */
export function inspectComponentInput(value: unknown): ExactComponentInputInspection {
	if (typeof value !== 'object' || value === null) return { kind: 'noncomponent' };
	if (Object.getOwnPropertyDescriptor(value, preparedBrand)) {
		const issued = receipts.get(value);
		if (!issued) return { kind: 'unclassified-issued' };
		const r = issued.recipe;
		return {
			kind: 'component',
			generation: componentContractVersion,
			target: r.contract.artifact.target,
			component: issued.component,
			key: r.key,
			domain: r.domain,
			clientBoundaryId: r.clientBoundaryId,
			enhancement: r.enhancement
		};
	}
	if (
		Object.getOwnPropertyDescriptor(
			value,
			Symbol.for('@exactjs/prepared-server-component-reference')
		)
	)
		return { kind: 'unclassified-issued' };
	if (!isOpaqueOperation(value)) return { kind: 'noncomponent' };
	const generation = opaqueOperationInputGeneration(value);
	if (generation !== componentContractVersion) return { kind: 'unclassified-issued' };
	const issued = receipts.get(value);
	if (!issued) return { kind: 'noncomponent' };
	const r = issued.recipe;
	return {
		kind: 'component',
		generation: componentContractVersion,
		target: r.contract.artifact.target,
		component: issued.component,
		key: r.key,
		domain: r.domain,
		clientBoundaryId: r.clientBoundaryId,
		enhancement: r.enhancement
	};
}
function operationRecipe(
	operation: unknown,
	provider: Readonly<{ version: number; target: ExactComponentTarget }>
): ExactComponentInputRecipe {
	assertComponentInputProvider(provider);
	if (typeof operation !== 'object' || operation === null) rejectComponentInput(provider);
	const recipe = receipts.get(operation)?.recipe;
	if (!recipe) rejectComponentInput(provider);
	if (
		recipe.contract.artifact.version !== provider.version ||
		recipe.contract.artifact.target !== provider.target
	)
		rejectComponentInput(
			provider,
			recipe.contract.artifact.version,
			recipe.contract.artifact.target
		);
	return recipe;
}
/** Requires issued identity and matching independent target/provider before exposing inputs. */
export function redeemComponentInput<T extends ExactComponentTarget>(
	operation: unknown,
	provider: ExactComponentInputProvider<T>
): ExactAdmittedComponentInput<T> {
	operationRecipe(operation, provider);
	return { operation } as ExactAdmittedComponentInput<T>;
}
/** Preserves childless direct server slots while validating their selected executable authority. */
export function redeemDirectServerComponentInput(
	type: AnyExactComponentCallable,
	props: Readonly<Record<string, unknown>>,
	provider: ExactComponentInputProvider<'server'>
): ExactAdmittedComponentInput<'server'> {
	const admitted = { direct: { type, props } } as ExactAdmittedComponentInput<'server'>;
	componentInputRecipe(admitted, provider);
	return admitted;
}
/** Revalidates source identity. A forged admitted object never authorizes raw payload access. */
export function componentInputRecipe<T extends ExactComponentTarget>(
	admitted: ExactAdmittedComponentInput<T>,
	provider: ExactComponentInputProvider<T>
): ExactComponentInputRecipe {
	if (typeof admitted !== 'object' || admitted === null) rejectComponentInput(provider);
	if ('operation' in admitted) return operationRecipe(admitted.operation, provider);
	assertComponentInputProvider(provider);
	if (provider.target !== 'server' || !('direct' in admitted)) rejectComponentInput(provider);
	if (typeof admitted.direct?.type !== 'function') rejectComponentInput(provider);
	let contract: ExactExecutableComponentContract;
	try {
		contract = readPreparedExactExecutableComponentContract(admitted.direct.type);
	} catch (error) {
		rethrowComponentInputFailure(error, provider);
	}
	if (contract.artifact.version !== provider.version || contract.artifact.target !== 'server')
		rejectComponentInput(provider, contract.artifact.version, contract.artifact.target);
	return {
		contract,
		props: admitted.direct.props,
		children: { kind: 'eager', values: [] },
		domain: undefined
	};
}
function executeComponentInput(this: object, target: object): unknown {
	return (target as ExactComponentInputsOperationTarget)[exactComponentInputsOperationV6](
		this as ExactComponentReceipt
	);
}
/** Internal issuance uses the existing isolated table, never an admission/provenance registry. */
export function issueComponentInputRecipe(
	component: AnyExactComponentCallable,
	recipe: ExactComponentInputRecipe,
	direct = false
): ExactComponentReceipt | ExactPreparedServerComponentReference {
	if (direct) {
		const reference = { [preparedBrand]: componentContractVersion };
		receipts.set(reference, { recipe, component });
		return reference as unknown as ExactPreparedServerComponentReference;
	}
	const operation = createOpaqueOperation<ExactComponentReceipt>(executeComponentInput, {
		key: recipe.key,
		domain: recipe.domain
	});
	receipts.set(operation, { recipe, component });
	return operation;
}
/** Issuer-owned transforms retain demand without granting a renderer an unvalidated input path. */
export function transformComponentInput(
	value: ExactComponentReceipt,
	transform: (recipe: ExactComponentInputRecipe) => ExactComponentInputRecipe
): ExactComponentReceipt {
	const recipe = receipts.get(value)?.recipe,
		identity = inspectComponentInput(value);
	if (!recipe || identity.kind !== 'component')
		throw new TypeError('Component transformation requires a current issued operation');
	return issueComponentInputRecipe(identity.component, transform(recipe)) as ExactComponentReceipt;
}

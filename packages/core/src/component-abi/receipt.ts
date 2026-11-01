import { isCompiledPropOperand, trackReactiveSource } from '@exactjs/reactive/framework/runtime';
import { componentContractVersion } from '../component/contract-versions.js';
import { unwrap } from '@exactjs/reactive/framework/values';
import type {
	AnyComponentInstance,
	Child,
	CompiledEnhancementNode
} from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import { readPreparedExactExecutableComponentContract } from '../component-contracts.js';
import type { AnyExactComponentCallable } from './executable-fields.js';
import type {
	ExactNarrowComponentUpdateContract,
	ExactWideComponentUpdateContract
} from '../component-contracts.js';
import {
	issueComponentInputRecipe,
	transformComponentInput,
	inspectComponentInput,
	type ExactComponentChildrenInput,
	type ExactComponentInputRecipe,
	type ExactPreparedServerComponentReference
} from './receipt-inputs.js';

export {
	inspectComponentInput,
	redeemComponentInput,
	redeemDirectServerComponentInput,
	componentInputRecipe,
	assertComponentOperationProvider,
	assertComponentInputProvider,
	exactComponentInputsOperationV6,
	isComponentInputIncompatibility,
	rethrowComponentInputFailure,
	type ExactComponentChildrenInput,
	type ExactComponentInputRecipe,
	type ExactPreparedServerComponentReference,
	type ExactComponentInputInspection,
	type ExactComponentInputProvider,
	type ExactComponentTarget,
	type ExactAdmittedComponentInput,
	type ExactComponentInputsOperationTarget,
	type ExactComponentInputIncompatibility
} from './receipt-inputs.js';

declare const exactComponentReceiptBrand: unique symbol;
/** Opaque selected component operation. Only matching providers can redeem its inputs. */
export type ExactComponentReceipt = object & { readonly [exactComponentReceiptBrand]: never };
/** Exact indexed supplier membership for a compiler-closed component input plan. */
export type ExactComponentReceiptUpdate = Readonly<{
	target: number;
	owner: AnyComponentInstance;
	contract: ExactNarrowComponentUpdateContract | ExactWideComponentUpdateContract;
}>;
const emptyChildren: ExactComponentChildrenInput = { kind: 'eager', values: [] };
/** Retains compiler operands for receiving acquisition while flattening ordinary authored arrays. */
function eagerChildren(input: readonly unknown[]): Child[] {
	const values = [...input];
	const children: Child[] = [];
	const append = (value: unknown): void => {
		if (Array.isArray(value) && !isCompiledPropOperand(value)) {
			for (const child of value) append(child);
		} else children.push(value as Child);
	};
	for (const value of values) append(value);
	// An actual empty array operand owns the children value. A childless call still delegates.
	if (values.length && !children.length) children.push(undefined);
	return children;
}
function recipe(
	type: AnyExactComponentCallable,
	props: Record<string, unknown> | null,
	children: ExactComponentChildrenInput
): ExactComponentInputRecipe {
	const contract = readPreparedExactExecutableComponentContract(type);
	const { key: authoredKey, __exactEnhancements: enhancement, ...componentProps } = props ?? {};
	for (const key of Reflect.ownKeys(componentProps))
		trackReactiveSource(Reflect.get(componentProps, key));
	const rawKey = unwrap(authoredKey);
	const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
	return {
		contract,
		props: componentProps,
		children:
			children.kind === 'eager'
				? { kind: 'eager', values: eagerChildren(children.values) }
				: children,
		domain: currentComponentDomain(),
		...(key === undefined ? {} : { key }),
		...(enhancement ? { enhancement: enhancement as CompiledEnhancementNode } : {})
	};
}
/** Issues eager or fallback child demand without changing the component root kind. */
export function createCompiledComponentInputReceipt(
	type: AnyExactComponentCallable,
	props: Record<string, unknown> | null,
	children: ExactComponentChildrenInput = emptyChildren
): ExactComponentReceipt {
	return issueComponentInputRecipe(type, recipe(type, props, children)) as ExactComponentReceipt;
}
/** Issues a server-local component input recipe consumed once per execution occurrence. */
export function createPreparedServerComponentInputReference(
	type: AnyExactComponentCallable,
	props: Record<string, unknown> | null,
	children: ExactComponentChildrenInput = emptyChildren
): ExactPreparedServerComponentReference {
	const contract = readPreparedExactExecutableComponentContract(type);
	const source = props ?? {};
	const authoredKey = source.key;
	const enhancement = source.__exactEnhancements;
	const rawKey = unwrap(authoredKey);
	const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
	let componentProps = source;
	if (Object.hasOwn(source, 'key') || Object.hasOwn(source, '__exactEnhancements')) {
		componentProps = { ...source };
		delete componentProps.key;
		delete componentProps.__exactEnhancements;
	}
	return issueComponentInputRecipe(
		type,
		{
			contract,
			props: componentProps,
			children:
				children.kind === 'eager'
					? { kind: 'eager', values: eagerChildren(children.values) }
					: children,
			domain: currentComponentDomain(),
			...(key === undefined ? {} : { key }),
			...(enhancement ? { enhancement: enhancement as CompiledEnhancementNode } : {})
		},
		true
	) as ExactPreparedServerComponentReference;
}
/** Retains a compiler-proven fresh plain prop bag with no reserved inherited or own metadata. */
export function createPreparedServerComponentInputReferenceFromPlainProps(
	type: AnyExactComponentCallable,
	props: Record<string, unknown>
): ExactPreparedServerComponentReference {
	return issueComponentInputRecipe(
		type,
		{
			contract: readPreparedExactExecutableComponentContract(type),
			props,
			children: emptyChildren,
			domain: currentComponentDomain()
		},
		true
	) as ExactPreparedServerComponentReference;
}
/** Copies placeholder identity without acquiring props or child demand. */
export function withCompiledClientBoundaryIdentity(
	value: ExactComponentReceipt,
	boundaryId: string
): ExactComponentReceipt {
	return transformComponentInput(value, (data) => ({ ...data, clientBoundaryId: boundaryId }));
}
/** Attaches exact indexed supplier membership without changing child demand. */
export function withCompiledComponentReceiptUpdate(
	value: ExactComponentReceipt,
	target: number,
	contract: ExactNarrowComponentUpdateContract | ExactWideComponentUpdateContract,
	owner: object
): ExactComponentReceipt {
	const update = { target, contract, owner: owner as AnyComponentInstance };
	validateComponentReceiptSupplier(update);
	return transformComponentInput(value, (data) => ({ ...data, update }));
}
/** Preserves declaration metadata while selecting transparent parent update ownership. */
export function withTransparentComponentUpdateOwner(
	value: ExactComponentReceipt
): ExactComponentReceipt {
	return transformComponentInput(value, (data) => ({ ...data, transparentUpdateOwner: true }));
}
/** Removes declaration metadata without inspecting or evaluating component inputs. */
export function withoutCompiledComponentReceiptEnhancement(
	value: unknown
): ExactComponentReceipt | undefined {
	const identity = inspectComponentInput(value);
	if (identity.kind !== 'component') return undefined;
	if (!identity.enhancement) return value as ExactComponentReceipt;
	return transformComponentInput(
		value as ExactComponentReceipt,
		({ enhancement: _enhancement, ...plain }) => plain
	);
}
/** Copies renderer-selected fragment handoff without adding authored props. */
export function withFragmentEnhancementTarget(
	value: ExactComponentReceipt,
	supplied: Child,
	tag = 'span'
): ExactComponentReceipt {
	return transformComponentInput(value, (data) => ({ ...data, fragmentTarget: { supplied, tag } }));
}
/** Validates a live lexical issuer and its exact indexed update contract. */
export function validateComponentReceiptSupplier(update: ExactComponentReceiptUpdate): void {
	if (!update.owner?.scope.active)
		throw new TypeError(
			'Component update requires its live lexical supplier and exact compiled update contract'
		);
	const artifact = readPreparedExactExecutableComponentContract(update.owner.type).artifact;
	if (artifact.target !== 'client' || artifact.updates !== update.contract)
		throw new TypeError(
			'Component update requires its live lexical supplier and exact compiled update contract'
		);
}
/** Rejects a provider whose independent implementation generation does not match core. */
export function assertComponentInputVersion(providerVersion: number): void {
	if (providerVersion !== componentContractVersion)
		throw new TypeError(
			`Unsupported component input provider version ${String(providerVersion)}; expected ${componentContractVersion}. Rebuild matching eXact providers.`
		);
}

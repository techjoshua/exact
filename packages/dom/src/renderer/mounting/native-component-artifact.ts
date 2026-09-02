import {
	type AnyComponentInstance,
	type Child,
	createErrorReport,
	handleComponentError,
	normalizeChildren,
	pageComponentDomain
} from '@exactjs/core';
import {
	exactCompiledClientAttachment,
	exactCompatibilityClientAttachment,
	type ExactClientComponentArtifact,
	type ExactComponentReceiptData
} from '@exactjs/core/runtime/component-operations';
import {
	compiledReactivePropertyOperand,
	createEffectScope,
	isReactiveValue,
	unwrap,
	withEffectScope,
	type CompiledReactivePropertyOperand,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render-operations';
import type { Mounted, Root } from '../../types.js';
import { isDomRenderLimitError, withTreeDepth } from '../limits.js';
import { refreshComponentRoot, rootIntroduction } from '../component-roots.js';
import { ownMountedInstance } from '../component-mount-ownership.js';
import { createMarker } from '../root-support.js';
import { mountDetachedChildren } from './children.js';
import { countDomWork } from '../limits.js';
import { bindCompiledComponentUpdate } from '../component-update-binding.js';
import { bindCompiledWideComponentUpdate } from '../component-update-wide-binding.js';
import {
	bindCompiledStateComponentUpdate,
	bindCompiledWideStateComponentUpdate
} from '../component-state-update-binding.js';
import type { CompiledProgramBindingTarget } from '../component-update-storage.js';
import { requireForeignComponentCapability } from '../foreign-component-capability.js';

const transparentComponentUpdateOwners = new WeakMap<AnyComponentInstance, AnyComponentInstance>();

/** Redeems one opaque component receipt through only its compiler-selected client attachment ABI. */
export function mountComponentReceipt(
	root: Root,
	receipt: ExactComponentReceiptData,
	parentInstance?: AnyComponentInstance,
	parentScope?: EffectScope,
	parentNode?: Node
): Mounted {
	return withTreeDepth(root, () => {
		countDomWork(root);
		const scope = createEffectScope(parentScope);
		try {
			return mountNativeComponentArtifact(root, receipt, scope, parentInstance, parentNode);
		} catch (error) {
			scope.stop();
			throw error;
		}
	});
}

function mountNativeComponentArtifact(
	root: Root,
	receipt: ExactComponentReceiptData,
	scope: EffectScope,
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined
): Mounted {
	const artifact = receipt.contract.artifact;
	if (artifact.target !== 'client')
		throw new TypeError(`Component receipt selected non-client artifact ${artifact.id}`);
	const mounted: Mounted = {
		componentReceipt: receipt,
		dom: createMarker(root, 'component'),
		scope,
		children: [],
		clientArtifact: artifact
	};
	const target = new NativeClientAttachmentTarget(root, mounted, parentNode);
	try {
		const domain = receipt.domain ?? parentInstance?.domain ?? root.domain ?? pageComponentDomain;
		// Compiler-indexed component operations carry finalized parent values and therefore
		// resolve their marked operands before construction. Framework-created operations
		// (notably enhancement-provider chains) deliberately retain reactive prop sources so
		// the provider can forward their ownership without inventing a runtime dirty program.
		const initialProps = receipt.update ? resolvePropReceipt(receipt.props) : receipt.props;
		const instance = withEffectScope(scope, () =>
			artifact.construct(
				parentInstance,
				componentProps(initialProps, resolveChildReceipt(receipt.children)),
				parentInstance?.ambientContexts ?? root.ambientContexts,
				domain,
				undefined,
				receipt.contract
			)
		);
		ownMountedInstance(mounted, instance);
		const authoredUpdateOwner = componentReceiptUpdateOwner(parentInstance);
		if (receipt.transparentUpdateOwner && authoredUpdateOwner)
			transparentComponentUpdateOwners.set(instance, authoredUpdateOwner);
		artifact.attach(instance, target, 'mount');
		bindComponentReceiptUpdate(mounted, authoredUpdateOwner, receipt);
		target.finishConstruction();
	} catch (error) {
		if (isDomRenderLimitError(error)) throw error;
		const fallback = handleComponentError(
			parentInstance,
			createErrorReport(error, 'construct', parentInstance, artifact.id),
			null
		);
		const output = fallback?.();
		mounted.children =
			output === undefined
				? []
				: mountDetachedChildren(
						root,
						(Array.isArray(output) ? output : [output]) as Child[],
						parentInstance,
						scope,
						parentNode
					);
	}
	return mounted;
}

/** Joins one compiler-indexed parent dirty target to this retained child receipt. */
function bindComponentReceiptUpdate(
	mounted: Mounted,
	owner: AnyComponentInstance | undefined,
	receipt: ExactComponentReceiptData
): void {
	const update = receipt.update;
	if (!update || !owner) return;
	const stopBindings: Array<{ stop(): void }> = [];
	const target: CompiledProgramBindingTarget = { mounted, owner, stopBindings, valid: true };
	const wide = 'words' in update.contract && typeof update.contract.words === 'number';
	const receivesProps = 'props' in update.contract && typeof update.contract.props === 'number';
	if (wide) {
		if (receivesProps) bindCompiledWideComponentUpdate(target, update.target, update.contract);
		else bindCompiledWideStateComponentUpdate(target, update.target, update.contract);
	} else if (receivesProps) bindCompiledComponentUpdate(target, update.target, update.contract);
	else bindCompiledStateComponentUpdate(target, update.target, update.contract);
	if (stopBindings.length !== 0)
		mounted.stop = () => {
			for (const binding of stopBindings) binding.stop();
		};
}

/** Skips renderer-injected providers while retaining their semantic context parentage. */
function componentReceiptUpdateOwner(
	instance: AnyComponentInstance | undefined
): AnyComponentInstance | undefined {
	let owner = instance;
	const visited = new Set<AnyComponentInstance>();
	while (owner && !visited.has(owner)) {
		visited.add(owner);
		const transparent = transparentComponentUpdateOwners.get(owner);
		if (!transparent) return owner;
		owner = transparent;
	}
	return owner;
}

/** Resolves only compiler-marked prop operands; arbitrary objects remain opaque values. */
function resolvePropReceipt(
	props: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
	let resolved: Record<string, unknown> | undefined;
	for (const key of Object.keys(props)) {
		const value = props[key];
		const operand =
			Array.isArray(value) && value[0] === compiledReactivePropertyOperand
				? (value as unknown as CompiledReactivePropertyOperand)
				: undefined;
		if (!operand && !isReactiveValue(value)) continue;
		(resolved ??= { ...props })[key] = operand
			? Reflect.get(operand[1], operand[2])
			: unwrap(value);
	}
	return resolved ?? props;
}

/** Publishes the next compiler-issued receipt through its selected prop update contract. */
export function receiveComponentReceipt(
	mounted: Mounted,
	receipt: ExactComponentReceiptData
): boolean {
	if (!mounted.clientArtifact || !mounted.instance) return false;
	mounted.clientArtifact.receive(
		mounted.instance,
		receipt.update ? resolvePropReceipt(receipt.props) : receipt.props,
		resolveChildReceipt(receipt.children)
	);
	mounted.componentReceipt = receipt;
	return true;
}

/** Applies one compiler-selected parent prop receipt directly to its retained child artifact. */
export function applyCompiledComponentReceipt(target: ExactRenderProgramBindingTarget): void {
	const mounted = (target as CompiledProgramBindingTarget).mounted;
	const receipt = mounted.componentReceipt;
	if (receipt) receiveComponentReceipt(mounted, receipt);
}

function componentProps(
	props: Readonly<Record<string, unknown>>,
	children: readonly Child[]
): Record<string, unknown> {
	const result = { ...props };
	if (children.length === 1) result.children = children[0];
	else if (children.length > 1) result.children = children;
	return result;
}

/** Resolves compiler-marked child operands to the finalized values in this receipt batch. */
function resolveChildReceipt(children: readonly Child[]): Child[] {
	return normalizeChildren(children.map((child) => unwrap(child)));
}

class NativeClientAttachmentTarget {
	constructor(
		private readonly root: Root,
		private readonly mounted: Mounted,
		private readonly parentNode: Node | undefined
	) {}

	[exactCompiledClientAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		rendered: Child[],
		mode: 'mount' | 'hydrate'
	): Mounted {
		this.assertAttachment(artifact, instance, mode);
		this.mounted.children = mountDetachedChildren(
			this.root,
			rendered,
			instance as AnyComponentInstance,
			this.mounted.scope,
			this.parentNode
		);
		refreshComponentRoot(instance as AnyComponentInstance, true, rootIntroduction(this.root));
		this.mounted.afterPlacement = () => (instance as AnyComponentInstance).markMounted();
		this.mounted.afterPlacementPhase = 'mount';
		return this.mounted;
	}

	[exactCompatibilityClientAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		mode: 'mount' | 'hydrate'
	): Mounted {
		this.assertAttachment(artifact, instance, mode);
		requireForeignComponentCapability().attach(
			this.root,
			this.mounted,
			artifact,
			instance as AnyComponentInstance,
			this.parentNode
		);
		return this.mounted;
	}

	finishConstruction(): boolean {
		return false;
	}

	private assertAttachment(
		artifact: ExactClientComponentArtifact,
		instance: object,
		mode: 'mount' | 'hydrate'
	): void {
		if (
			mode !== 'mount' ||
			instance !== this.mounted.instance ||
			artifact !== this.mounted.clientArtifact
		)
			throw new TypeError('Client component attached through an incompatible DOM target');
	}
}

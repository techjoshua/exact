import type { ExactRenderProgramInvocation } from '@exactjs/core/runtime/render-operations';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import { mountDirectRenderProgram } from '../render-program-operation.js';
import { roots } from '../../state.js';
import { isComponentInputIncompatibility } from '@exactjs/core/runtime/component-operations';
import {
	clientComponentRecipe,
	type AdmittedClientComponentInput
} from '../component-input-admission.js';
import {
	retainSuppliedPlacement,
	withSuppliedPlacementInputs
} from '../supplied-placement-capability.js';
import { domEnhancementCapability } from '../enhancement-capability.js';
import {
	type AnyComponentInstance,
	type Child,
	createErrorReport,
	attachSuppressedCleanupFailure,
	handleComponentError,
	pageComponentDomain
} from '@exactjs/core';
import { withComponentResumption } from '@exactjs/core';
import {
	exactCompiledClientAttachment,
 exactCompiledDirectProgramAttachment,
	exactCompatibilityClientAttachment,
	type ExactClientComponentArtifact
} from '@exactjs/core/runtime/component-operations';
import { withEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../../types.js';
import { isDomRenderLimitError, withTreeDepth } from '../limits.js';
import { refreshComponentRoot, rootIntroduction } from '../component-roots.js';
import { createMountedScope, ownMountedInstance } from '../component-mount-ownership.js';
import { createMarker } from '../root-support.js';
import { mountDetachedChildren } from './children.js';
import { unmountMounted } from '../teardown.js';
import { countDomWork } from '../limits.js';
import {
	bindComponentReceiptUpdate,
	prepareComponentReceiptBinding
} from '../component-receipt-binding.js';

export { applyCompiledComponentReceipt } from '../component-receipt-binding.js';
import { requireForeignComponentCapability } from '../foreign-component-capability.js';
import type { PreparedComponentAttachment } from '../prepared-component-attachment.js';

/** Redeems one opaque component receipt through only its compiler-selected client attachment ABI. */
export function mountComponentReceipt(
	root: Root,
	receipt: AdmittedClientComponentInput,
	parentInstance?: AnyComponentInstance,
	parentScope?: EffectScope,
	parentNode?: Node
): Mounted {
	receipt = clientComponentRecipe(receipt.admitted);
	const prepared = root.preparedComponents?.take(receipt.admitted.operation, parentInstance);
	if (prepared) {
		const mounted = prepared.attachment.ownedRange;
		if (prepared.attachment.owner.parent !== parentInstance)
			throw new Error('Prepared component cannot attach beneath a different context owner');
		return prepared.attachment.commit(
			new NativeClientAttachmentTarget(root, mounted, parentNode),
			prepared.project,
			'mount'
		);
	}
	return withTreeDepth(root, () => {
		countDomWork(root);
		const scope = createMountedScope(parentScope);
		try {
			return mountNativeComponentArtifact(root, receipt, scope, parentInstance, parentNode);
		} catch (error) {
			try {
				scope.stop();
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
			throw error;
		}
	});
}

/** Constructs one native owner, optionally capturing its output for a separately selected preparation. */
export function mountNativeComponentArtifact(
	root: Root,
	receipt: AdmittedClientComponentInput,
	scope: EffectScope,
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined,
	preparation?: PreparedComponentAttachment,
	preparationMode: 'mount' | 'hydrate' = 'mount'
): Mounted {
	receipt = clientComponentRecipe(receipt.admitted);
	const artifact = receipt.contract.artifact;
	if (artifact.target !== 'client')
		throw new TypeError(`Component receipt selected non-client artifact ${artifact.id}`);
	const mounted: Mounted = {
		componentReceipt: receipt,
		dom: createMarker(root, 'component'),
		// Match the boundary-slot position used by marked hydration.
		end: undefined,
		scope,
		children: [],
		clientArtifact: artifact
	};
	if (root.suppliedPlacementPlan?.pending && root.suppliedPlacementPlan.isCurrent())
		root.suppliedPlacementPlan.own(mounted);
	const rootAttempt = root.componentInputAttempt;
	const rootVersion = root.version;
	const receivingCurrent = () =>
		!rootAttempt?.disposed &&
		(!rootAttempt ||
			(root.componentInputAttempt === rootAttempt &&
				roots.get(root.container) === root &&
				root.version === rootVersion));
	let deliveryStarted = false;
	const target = new NativeClientAttachmentTarget(root, mounted, parentNode);
	preparation?.own(mounted);
	if (!receivingCurrent()) {
		scope.stop();
		return mounted;
	}
	try {
		const domain = receipt.domain ?? parentInstance?.domain ?? root.domain ?? pageComponentDomain;
		// Compiler-indexed component operations carry finalized parent values and therefore
		// resolve their marked operands before construction. Framework-created operations
		// (notably enhancement-provider chains) deliberately retain reactive prop sources so
		// the provider can forward their ownership without inventing a runtime dirty program.
		const preparedInput =
			mounted.componentReceiptBinding?.pending ??
			prepareComponentReceiptBinding(mounted, receipt, receivingCurrent);
		if (!preparedInput.isCurrent()) {
			preparedInput.stop();
			scope.stop();
			return mounted;
		}
		const inputs = preparedInput.inputs;
		const initialProps = withEffectScope(scope, () =>
			componentProps(inputs.props, inputs.children)
		);
		if (!preparedInput.isCurrent()) {
			preparedInput.stop();
			scope.stop();
			return mounted;
		}
		const construct = () =>
			withEffectScope(scope, () =>
				artifact.construct(
					parentInstance,
					initialProps,
					parentInstance?.ambientContexts ?? root.ambientContexts,
					domain,
					undefined,
					receipt.contract
				)
			);
		deliveryStarted = true;
		if (root.componentInputAttempt?.operation === receipt.admitted.operation)
			root.componentInputAttempt.deliveryStarted = true;
		preparedInput.beginDelivery();
		const instance =
			preparationMode === 'hydrate' ? withComponentResumption(domain, construct) : construct();
		ownMountedInstance(mounted, instance);
		if (!preparedInput.isCurrent()) {
			unmountMounted(mounted);
			return mounted;
		}
		if (preparation) {
			preparation.capture(
				artifact,
				instance,
				target,
				() => {
					bindComponentReceiptUpdate(mounted, receipt);
					target.finishConstruction();
				},
				preparationMode
			);
		} else {
			artifact.attach(instance, target, 'mount');
			bindComponentReceiptUpdate(mounted, receipt);
			target.finishConstruction();
		}
	} catch (error) {
		if (
			!receivingCurrent() ||
			!deliveryStarted ||
			preparation ||
			isDomRenderLimitError(error) ||
			isComponentInputIncompatibility(error)
		)
			throw error;
		const report = createErrorReport(error, 'construct', parentInstance, artifact.id);
		const fallback = parentInstance
			? handleComponentError(parentInstance, report, null)
			: undefined;
		// Before a root instance exists, its renderer still owns the error context and report hook.
		if (!parentInstance) root.errors.report(report);
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

/** Publishes the next compiler-issued receipt through its selected prop update contract. */
export function receiveComponentReceipt(
	mounted: Mounted,
	receipt: AdmittedClientComponentInput,
	onDelivery?: () => void
): { committed: boolean; isCurrent(): boolean } {
	const prepared = prepareComponentReceiptBinding(mounted, receipt);
	try {
		if (!mounted.clientArtifact || !mounted.instance || !prepared.isCurrent())
			return { committed: false, isCurrent: prepared.isCurrent };
		if (mounted.componentReceiptBinding?.pending !== prepared)
			return { committed: false, isCurrent: prepared.isCurrent };
		prepared.beginDelivery();
		onDelivery?.();
		withSuppliedPlacementInputs(mounted.instance, () =>
			mounted.clientArtifact!.receive(
				mounted.instance!,
				prepared.inputs.props,
				prepared.inputs.children
			)
		);
		const committed = prepared.isCurrent() && prepared.commit();
		return { committed, isCurrent: prepared.isCurrent };
	} finally {
		if (mounted.componentReceiptBinding?.pending === prepared)
			mounted.componentReceiptBinding.pending = undefined;
		prepared.stop();
	}
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

class NativeClientAttachmentTarget {
	constructor(
		private readonly root: Root,
		private readonly mounted: Mounted,
		private readonly parentNode: Node | undefined
	) {}

	[exactCompiledClientAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		rendered: Child[] | ExactRenderProgramInvocation,
		mode: 'mount' | 'hydrate'
	): Mounted {
		this.assertAttachment(artifact, instance, mode);
  if (Array.isArray(rendered)) {
		retainSuppliedPlacement(this.mounted, rendered, this.root);
		this.mounted.children = mountDetachedChildren(
			this.root,
			this.mounted.componentReceipt?.fragmentTarget
				? domEnhancementCapability()!.projectComponent!(this.mounted, rendered)
				: rendered,
			instance as AnyComponentInstance,
			this.mounted.scope,
			this.parentNode
		);
  } else {
   if (rendered.owner !== instance || this.mounted.componentReceipt?.fragmentTarget)
    throw new TypeError('Direct component output requires its original owner and finite root placement');
   const scope = createEffectScope(this.mounted.scope);
   try {
    countDomWork(this.root);
    const region = mountDirectRenderProgram(this.root, rendered, scope, instance as AnyComponentInstance, this.parentNode);
    if (!region) throw new Error('Direct compiled region failed its finite DOM claim');
    this.mounted.children = [region];
   } catch (error) { scope.stop(); throw error; }
  }
		if (this.root.suppliedPlacementPlan?.pending && this.root.suppliedPlacementPlan.isCurrent())
			this.root.suppliedPlacementPlan.present(
				instance as AnyComponentInstance,
				true,
				rootIntroduction(this.root)
			);
		else
			refreshComponentRoot(
				this.root,
				instance as AnyComponentInstance,
				true,
				rootIntroduction(this.root)
			);
		this.mounted.afterPlacement = () => (instance as AnyComponentInstance).markMounted();
		this.mounted.afterPlacementPhase = 'mount';
		return this.mounted;
	}

 [exactCompiledDirectProgramAttachment](artifact: ExactClientComponentArtifact, instance: object, invocation: ExactRenderProgramInvocation, mode: 'mount' | 'hydrate'): Mounted {
  return this[exactCompiledClientAttachment](artifact, instance, invocation, mode);
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

import { isAdoptionSuperseded } from './receiving-lifetime.js';
import { createMountedScope } from '../component-mount-ownership.js';
import {
	admitCompiledComponentInput,
	clientComponentRecipe
} from '../component-input-admission.js';
import { bindComponentReceiptUpdate } from '../component-receipt-binding.js';
import { isComponentInputIncompatibility } from '@exactjs/core/runtime/component-operations';
import { type AdmittedClientComponentInput } from '../component-input-admission.js';
import type { Child } from '@exactjs/core';
import {
	withEffectScope,
	registerEffectScopeCleanup,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import { clearDelegated } from '../../events.js';
import { roots } from '../../state.js';
import type { Mounted, RenderOptions, Root } from '../../types.js';
import { domEnhancementCapability } from '../enhancement-capability.js';
import { countDomWork, isDomRenderLimitError, withDomWork } from '../limits.js';
import { mountDetachedOperation } from '../mounting/children.js';
import { createRendererRoot } from '../root-construction.js';
import { unmountMounted, releaseCreatedAdoptionEndpoints } from '../teardown.js';
import { adoptComponentChildren } from './boundaries.js';
import { attachHydratedComponent } from './component-attachment.js';
import { componentMarkerBoundaryByIdentity } from './component-receipt-identity.js';
import { snapshotChildNodes } from './child-nodes.js';
import { constructReceipt, receiptClientArtifact } from './component-receipt.js';
import { ownMountedInstance } from '../component-mount-ownership.js';
import { beginDomProfile, finishDomProfile } from '../profiling.js';

/** Private adoption state also fences wrapper cleanup after authored reentry. */
export interface ComponentRootAdoption {
	/** Distinguishes genuine markup mismatch from an obsolete receiving attempt. */
	outcome: 'adopted' | 'mismatch' | 'superseded';
	/** True only while this attempt's accepted or still-unowned range remains current. */
	isCurrent(): boolean;
}

/** Captures the existing renderer generation, never inferring ownership from markup. */
export function captureComponentRootOwnership(container: Element): () => boolean {
	const root = roots.get(container),
		attempt = root?.componentInputAttempt,
		version = root?.version;
	return () =>
		roots.get(container) === root &&
		(!root || (root.componentInputAttempt === attempt && root.version === version));
}

/**
 * Captures a committed renderer lifetime for disposal, independently of later receiving attempts.
 * A retained receive keeps this mount. Replacement or unmount revokes the captured ownership.
 * Stopping its scope during teardown does not revoke the remaining range cleanup.
 */
export function captureComponentRootLifetime(container: Element): (() => boolean) | undefined {
	const root = roots.get(container),
		mounted = root?.mounted;
	if (!root?.initialCommitComplete || !mounted?.scope.active) return undefined;
	return () => roots.get(container) === root && root.mounted === mounted;
}

/** Creates a nonevaluating attempt before callers create or acquire component inputs. */
export function createComponentRootAdoption(container: Element): ComponentRootAdoption {
	return { outcome: 'mismatch', isCurrent: captureComponentRootOwnership(container) };
}

/** Adopts one marked compiler-issued component root without generic root classification. */
export function adoptCompiledComponentInputRoot(
	operation: Child,
	container: Element,
	options: RenderOptions = {},
	adoption = createComponentRootAdoption(container)
): ComponentRootAdoption {
	const receipt = clientComponentRecipe(admitCompiledComponentInput(operation));
	if (roots.has(container)) return adoption;
	const nodes = snapshotChildNodes(container);
	const boundary = componentMarkerBoundaryByIdentity(nodes, 0, receipt.contract.artifact.id);
	if (!boundary?.matches) return adoption;
	return adoptReceiptRoot(
		createRendererRoot(container, operation, options, { version: 1, mode: 'hydrated' }),
		{
			componentReceipt: receipt,
			dom: boundary.start,
			end: nodes[boundary.endIndex]!,
			scope: createMountedScope(undefined),
			children: [],
			clientArtifact: receiptClientArtifact(receipt)
		},
		receipt,
		nodes.slice(1, boundary.endIndex),
		options,
		adoption
	);
}

/** Adopts a markerless compiler-issued component root using the same attachment ABI. */
export function adoptMarkerlessCompiledComponentInputRoot(
	operation: Child,
	container: Element,
	options: RenderOptions = {},
	adoption = createComponentRootAdoption(container)
): ComponentRootAdoption {
	const receipt = clientComponentRecipe(admitCompiledComponentInput(operation));
	if (roots.has(container)) return adoption;
	const start = document.createTextNode('');
	const end = document.createTextNode('');
	container.insertBefore(start, container.firstChild);
	container.insertBefore(
		end,
		container.querySelector(':scope > script#__exact_hydration[type="application/json"]')
	);
	const root = createRendererRoot(container, operation, options, {
		version: 1,
		mode: 'hydrated',
		markerlessHydration: true
	});
	const mounted: Mounted = {
		componentReceipt: receipt,
		dom: start,
		end,
		scope: createMountedScope(undefined),
		children: [],
		clientArtifact: receiptClientArtifact(receipt)
	};
	const release = () => releaseCreatedAdoptionEndpoints(root, mounted, start, end);
	registerEffectScopeCleanup(mounted.scope, release);
	const nodes: Node[] = [];
	for (let current = start.nextSibling; current && current !== end; current = current.nextSibling)
		nodes.push(current);
	let adopted = false;
	try {
		const result = adoptReceiptRoot(root, mounted, receipt, nodes, options, adoption);
		adopted = result.outcome === 'adopted';
		return result;
	} finally {
		if (!adopted) {
			release();
		}
	}
}

/** Adopts a compiler-issued component whose opaque output owns the current document element. */
export function adoptDocumentCompiledComponentInputRoot(
	operation: Child,
	documentNode: Document,
	options: RenderOptions = {},
	adoption = createComponentRootAdoption(documentNode.documentElement),
	acquisition?: Readonly<{ scope: EffectScope; intent: 'render-update' }>
): ComponentRootAdoption {
	const receipt = clientComponentRecipe(admitCompiledComponentInput(operation));
	const container = documentNode.documentElement;
	if (!container || roots.has(container)) return adoption;
	const start = documentNode.createComment('exact:document-root');
	const end = documentNode.createComment('/exact:document-root');
	documentNode.insertBefore(start, container);
	documentNode.insertBefore(end, container.nextSibling);
	let adopted = false;
	try {
		const result = adoptReceiptRoot(
			createRendererRoot(container, operation, options, {
				version: 1,
				mode: 'document',
				markerlessHydration: true
			}),
			{
				componentReceipt: receipt,
				dom: start,
				end,
				scope: acquisition?.scope ?? createMountedScope(undefined),
				children: [],
				clientArtifact: receiptClientArtifact(receipt)
			},
			receipt,
			[container],
			options,
			adoption,
			acquisition?.intent
		);
		adopted = result.outcome === 'adopted';
		return result;
	} finally {
		if (!adopted) {
			start.remove();
			end.remove();
		}
	}
}

function adoptReceiptRoot(
	root: Root,
	mounted: Mounted,
	receipt: AdmittedClientComponentInput,
	nodes: readonly Node[],
	options: RenderOptions,
	adoption: ComponentRootAdoption,
	acquisitionIntent?: 'render-update'
): ComponentRootAdoption {
	// The opaque root operation carries declarations that receipt data alone cannot recover.
	mounted.operation = root.current;
	const attempt = { operation: root.current, deliveryStarted: false, acquisitionIntent };
	const rootVersion = root.version;
	root.componentInputAttempt = attempt;
	mounted.rawNodes = [...nodes];
	root.mounted = mounted;
	roots.set(root.container, root);
	const isCurrent = () =>
		roots.get(root.container) === root &&
		root.componentInputAttempt === attempt &&
		root.version === rootVersion &&
		mounted.scope.active;
	adoption.isCurrent = isCurrent;
	let accepted = false;
	try {
		const attached = withDomWork(root, () => {
			countDomWork(root);
			const constructionStarted = beginDomProfile(root);
			const instance = withEffectScope(mounted.scope, () =>
				constructReceipt(root, receipt, options.logicalParent, mounted, isCurrent)
			);
			finishDomProfile(root, 'component-construct', constructionStarted);
			ownMountedInstance(mounted, instance);
			if (!isCurrent()) return false;
			const attachmentStarted = beginDomProfile(root);
			const attached = attachHydratedComponent(
				root,
				mounted,
				mounted.clientArtifact!,
				instance,
				(children) => adoptComponentChildren(root, children, nodes, instance, mounted.scope)
			);
			finishDomProfile(root, 'component-attach', attachmentStarted);
			if (!attached || !isCurrent()) return false;
			bindComponentReceiptUpdate(mounted, receipt);
			if (!isCurrent()) return false;
			const capability = domEnhancementCapability();
			// Adopted chains need the same later selector reconciliation as mounted chains.
			capability?.install(root, (value, owner, scope, node) =>
				mountDetachedOperation(root, value, owner, scope, node)
			);
			root.mounted = capability
				? capability.activate(root, mounted, undefined, undefined, (value, owner, scope, node) =>
						mountDetachedOperation(root, value, owner, scope, node)
					)
				: mounted;
			if (!isCurrent()) return false;
			return true;
		});
		// Nested supplied targets discovered by commit still belong to this initial handoff.
		// Publish the committed lifetime only after its validated placement frames finish.
		if (attached && isCurrent()) {
			// The original SSR slice remains owned until nested initial placement finishes.
			mounted.rawNodes = undefined;
			root.initialCommitComplete = true;
			roots.set(root.container, root);
			accepted = true;
		}
		adoption.outcome = accepted ? 'adopted' : isCurrent() ? 'mismatch' : 'superseded';
		return adoption;
	} catch (error) {
		if (isDomRenderLimitError(error) || isComponentInputIncompatibility(error)) throw error;
		adoption.outcome = isAdoptionSuperseded(error) || !isCurrent() ? 'superseded' : 'mismatch';
		return adoption;
	} finally {
		attempt.acquisitionIntent = undefined;
		if (!accepted) {
			// A reentrant document handoff may already have released this provisional scope.
			if (mounted.scope.active) unmountMounted(mounted);
			if (roots.get(root.container) === root && root.componentInputAttempt === attempt) {
				roots.delete(root.container);
				root.mounted = undefined;
				clearDelegated(root);
				adoption.isCurrent = captureComponentRootOwnership(root.container);
			}
		}
		if (roots.get(root.container) === root && root.componentInputAttempt === attempt)
			root.workBudget = undefined;
	}
}

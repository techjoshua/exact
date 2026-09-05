import type { Child } from '@exactjs/core';
import type { ExactComponentReceiptData } from '@exactjs/core/runtime/component-operations';
import { createEffectScope, withEffectScope } from '@exactjs/reactive/framework/runtime';
import { clearDelegated } from '../../events.js';
import { roots } from '../../state.js';
import type { Mounted, RenderOptions, Root } from '../../types.js';
import { domEnhancementCapability } from '../enhancement-capability.js';
import { countDomWork, isDomRenderLimitError, withDomWork } from '../limits.js';
import { mountDetachedOperation } from '../mounting/children.js';
import { createRendererRoot } from '../root-construction.js';
import { unmountMounted } from '../teardown.js';
import { adoptComponentChildren } from './boundaries.js';
import { attachHydratedComponent } from './component-attachment.js';
import { componentMarkerBoundaryByIdentity } from './component-receipt-identity.js';
import { constructReceipt, receiptClientArtifact } from './component-receipt.js';
import { ownMountedInstance } from '../component-mount-ownership.js';
import { beginDomProfile, finishDomProfile } from '../profiling.js';

/** Adopts one marked compiler-issued component root without generic root classification. */
export function adoptCompiledComponentReceiptRoot(
	operation: Child,
	receipt: ExactComponentReceiptData,
	container: Element,
	options: RenderOptions = {}
): boolean {
	if (roots.has(container)) return false;
	const nodes = Array.from(container.childNodes);
	const boundary = componentMarkerBoundaryByIdentity(nodes, 0, receipt.contract.artifact.id);
	if (!boundary?.matches) return false;
	return adoptReceiptRoot(
		createRendererRoot(container, operation, options, { version: 1, mode: 'hydrated' }),
		{
			componentReceipt: receipt,
			dom: boundary.start,
			end: nodes[boundary.endIndex]!,
			scope: createEffectScope(),
			children: [],
			clientArtifact: receiptClientArtifact(receipt)
		},
		receipt,
		nodes.slice(1, boundary.endIndex),
		options
	);
}

/** Adopts a markerless compiler-issued component root using the same attachment ABI. */
export function adoptMarkerlessCompiledComponentReceiptRoot(
	operation: Child,
	receipt: ExactComponentReceiptData,
	container: Element,
	options: RenderOptions = {}
): boolean {
	if (roots.has(container)) return false;
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
		scope: createEffectScope(),
		children: [],
		clientArtifact: receiptClientArtifact(receipt)
	};
	const nodes: Node[] = [];
	for (let current = start.nextSibling; current && current !== end; current = current.nextSibling)
		nodes.push(current);
	const adopted = adoptReceiptRoot(root, mounted, receipt, nodes, options);
	if (!adopted) {
		start.remove();
		end.remove();
	}
	return adopted;
}

/** Adopts a compiler-issued component whose opaque output owns the current document element. */
export function adoptDocumentCompiledComponentReceiptRoot(
	operation: Child,
	receipt: ExactComponentReceiptData,
	documentNode: Document,
	options: RenderOptions = {}
): boolean {
	const container = documentNode.documentElement;
	if (!container || roots.has(container)) return false;
	const start = documentNode.createComment('exact:document-root');
	const end = documentNode.createComment('/exact:document-root');
	documentNode.insertBefore(start, container);
	documentNode.insertBefore(end, container.nextSibling);
	const adopted = adoptReceiptRoot(
		createRendererRoot(container, operation, options, {
			version: 1,
			mode: 'document',
			markerlessHydration: true
		}),
		{
			componentReceipt: receipt,
			dom: start,
			end,
			scope: createEffectScope(),
			children: [],
			clientArtifact: receiptClientArtifact(receipt)
		},
		receipt,
		[container],
		options
	);
	if (!adopted) {
		start.remove();
		end.remove();
	}
	return adopted;
}

function adoptReceiptRoot(
	root: Root,
	mounted: Mounted,
	receipt: ExactComponentReceiptData,
	nodes: readonly Node[],
	options: RenderOptions
): boolean {
	try {
		return withDomWork(root, () => {
			countDomWork(root);
			const constructionStarted = beginDomProfile(root);
			const instance = withEffectScope(mounted.scope, () =>
				constructReceipt(root, receipt, options.logicalParent)
			);
			finishDomProfile(root, 'component-construct', constructionStarted);
			ownMountedInstance(mounted, instance);
			const attachmentStarted = beginDomProfile(root);
			const attached = attachHydratedComponent(
				root,
				mounted,
				mounted.clientArtifact!,
				instance,
				(children) => adoptComponentChildren(root, children, nodes, instance, mounted.scope)
			);
			finishDomProfile(root, 'component-attach', attachmentStarted);
			if (!attached) return false;
			const capability = domEnhancementCapability();
			root.mounted = capability
				? capability.activate(root, mounted, undefined, undefined, (value, owner, scope, node) =>
						mountDetachedOperation(root, value, owner, scope, node)
					)
				: mounted;
			root.initialCommitComplete = true;
			roots.set(root.container, root);
			return true;
		});
	} catch (error) {
		if (isDomRenderLimitError(error)) throw error;
		return false;
	} finally {
		if (!roots.has(root.container)) {
			unmountMounted(mounted);
			clearDelegated(root);
		}
		root.workBudget = undefined;
	}
}

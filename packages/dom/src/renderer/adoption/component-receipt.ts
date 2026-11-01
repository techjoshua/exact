import { captureAdoptionCurrent, isAdoptionSuperseded } from './receiving-lifetime.js';
import { clientComponentRecipe } from '../component-input-admission.js';
import { isComponentInputIncompatibility } from '@exactjs/core/runtime/component-operations';
import { type AdmittedClientComponentInput } from '../component-input-admission.js';
import { registryHydrationContract } from '@exactjs/core/runtime/registry';
import {
	pageComponentDomain,
	type AnyComponentInstance,
	withComponentResumption
} from '@exactjs/core';
import type { ExactClientComponentArtifact } from '@exactjs/core/runtime/component-operations';
import {
	createEffectScope,
	registerEffectScopeCleanup,
	withEffectScope,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import { placeMountedBefore } from '../../placement.js';
import type { Mounted, Root } from '../../types.js';
import { mountComponentReceipt } from '../mounting/native-component-artifact.js';

import {
	prepareComponentReceiptBinding,
	bindComponentReceiptUpdate
} from '../component-receipt-binding.js';
import { ownMountedInstance } from '../component-mount-ownership.js';
import {
	unmountMounted,
	releaseCreatedAdoptionEndpoints,
	releaseUnpublishedAdoption
} from '../teardown.js';
import { adoptComponentChildren } from './boundaries.js';
import {
	attachHydratedComponent,
	attachPreparedHydratedComponent
} from './component-attachment.js';
import {
	clientPlaceholderBoundaryByIdentity,
	componentMarkerBoundaryByIdentity
} from './component-receipt-identity.js';

/** Adopts one opaque receipt through the artifact that issued it. */
export function adoptComponentReceipt(
	root: Root,
	receipt: AdmittedClientComponentInput,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	rangeEnd: number,
	omitCompilerOwnedBoundary: boolean
): { mounted: Mounted; next: number } | undefined {
	receipt = clientComponentRecipe(receipt.admitted);
	const scope = createEffectScope(parentScope);
	const boundary = componentMarkerBoundaryByIdentity(
		nodes,
		cursor,
		receipt.contract.artifact.id,
		rangeEnd
	);
	if (!boundary && receipt.clientBoundaryId) {
		const placeholder = clientPlaceholderBoundaryByIdentity(
			nodes,
			cursor,
			receipt.clientBoundaryId,
			rangeEnd
		);
		const parent = nodes[cursor]?.parentNode;
		scope.stop();
		if (!placeholder || !parent) return undefined;
		const mounted = mountComponentReceipt(root, receipt, parentInstance, parentScope, parent);
		placeMountedBefore(root, parent, mounted, nodes[cursor]);
		for (let index = cursor; index <= placeholder.endIndex; index++) {
			const stale = nodes[index]!;
			if (stale.parentNode === parent) parent.removeChild(stale);
		}
		return { mounted, next: placeholder.endIndex + 1 };
	}
	// A closed server component can omit its own wrapper while its first child
	// retains one. That child's identity must not be treated as a mismatched parent.
	if (omitCompilerOwnedBoundary && boundary && !boundary.matches)
		return adoptMarkerlessReceipt(root, receipt, nodes, cursor, parentInstance, scope, rangeEnd);
	if ((root.markerlessHydration || omitCompilerOwnedBoundary) && !boundary)
		return adoptMarkerlessReceipt(root, receipt, nodes, cursor, parentInstance, scope, rangeEnd);
	if (!boundary) {
		scope.stop();
		return undefined;
	}
	if (!boundary.matches) {
		const parent = nodes[cursor]?.parentNode;
		if (!parent) {
			scope.stop();
			return undefined;
		}
		scope.stop();
		const replacement = mountComponentReceipt(root, receipt, parentInstance, parentScope, parent);
		placeMountedBefore(root, parent, replacement, nodes[cursor]);
		for (let index = cursor; index <= boundary.endIndex; index++) {
			const stale = nodes[index];
			if (stale?.parentNode === parent) parent.removeChild(stale);
		}
		return { mounted: replacement, next: boundary.endIndex + 1 };
	}
	const prepared = root.preparedComponents?.take(receipt.admitted.operation, parentInstance);
	if (prepared) {
		scope.stop();
		const mounted = prepared.attachment.ownedRange;
		if (prepared.attachment.owner.parent !== parentInstance)
			throw new Error('Prepared component cannot adopt beneath a different context owner');
		mounted.dom = boundary.start;
		mounted.end = nodes[boundary.endIndex]!;
		attachPreparedHydratedComponent(
			root,
			prepared.attachment,
			(children) =>
				adoptComponentChildren(
					root,
					children,
					nodes,
					mounted.instance,
					mounted.scope,
					cursor + 1,
					boundary.endIndex
				),
			prepared.project
		);
		return { mounted, next: boundary.endIndex + 1 };
	}
	const mounted: Mounted = {
		componentReceipt: receipt,
		dom: boundary.start,
		end: nodes[boundary.endIndex]!,
		scope,
		children: [],
		clientArtifact: receiptClientArtifact(receipt)
	};
	try {
		const instance = constructReceipt(root, receipt, parentInstance, mounted);
		ownMountedInstance(mounted, instance);
		const artifact = mounted.clientArtifact!;
		if (
			!attachHydratedComponent(root, mounted, artifact, instance, (children) =>
				adoptComponentChildren(
					root,
					children,
					nodes,
					instance,
					scope,
					cursor + 1,
					boundary.endIndex
				)
			)
		) {
			unmountMounted(mounted);
			return undefined;
		}
		bindComponentReceiptUpdate(mounted, receipt);
		return { mounted, next: boundary.endIndex + 1 };
	} catch (error) {
		if (isComponentInputIncompatibility(error) || isAdoptionSuperseded(error)) throw error;
		unmountMounted(mounted);
		return undefined;
	}
}

function adoptMarkerlessReceipt(
	root: Root,
	receipt: AdmittedClientComponentInput,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance | undefined,
	scope: EffectScope,
	rangeEnd: number
): { mounted: Mounted; next: number } | undefined {
	const start = document.createTextNode('');
	let end: Text | undefined;
	const assertCurrent = captureAdoptionCurrent(root, scope);
	const mounted: Mounted = {
		componentReceipt: receipt,
		dom: start,
		// Match marked hydration's field order without allocating a boundary node.
		end: undefined,
		scope,
		children: [],
		clientArtifact: receiptClientArtifact(receipt)
	};
	registerEffectScopeCleanup(scope, () =>
		releaseCreatedAdoptionEndpoints(root, mounted, start, end)
	);
	try {
		const instance = constructReceipt(root, receipt, parentInstance, mounted);
		ownMountedInstance(mounted, instance);
		let adoptedNext = cursor;
		const artifact = mounted.clientArtifact!;
		if (
			!attachHydratedComponent(root, mounted, artifact, instance, (children) => {
				const adopted = adoptComponentChildren(
					root,
					children,
					nodes,
					instance,
					scope,
					cursor,
					rangeEnd
				);
				if (!adopted) return undefined;
				adoptedNext = rangeEnd;
				return adopted;
			})
		)
			return undefined;
		bindComponentReceiptUpdate(mounted, receipt);
		assertCurrent();
		const first = mounted.children[0]?.dom;
		const last = mounted.children.at(-1);
		if (!first || !last) {
			const boundary = nodes[rangeEnd] ?? nodes[cursor];
			const parent = boundary?.parentNode;
			if (!parent) return undefined;
			parent.insertBefore(mounted.dom, boundary);
			mounted.end = end = document.createTextNode('');
			parent.insertBefore(mounted.end, boundary);
			return { mounted, next: adoptedNext };
		}
		const parent = first?.parentNode;
		if (!parent) return undefined;
		const endNode = last.end ?? last.dom;
		parent.insertBefore(mounted.dom, first);
		mounted.end = end = document.createTextNode('');
		parent.insertBefore(mounted.end, endNode.nextSibling);
		return { mounted, next: adoptedNext };
	} catch (error) {
		if (isComponentInputIncompatibility(error) || isAdoptionSuperseded(error)) {
			releaseUnpublishedAdoption(root, [mounted], error);
			throw error;
		}
		unmountMounted(mounted);
		return undefined;
	}
}

/** Returns the client artifact already selected by an opaque component operation. */
export function receiptClientArtifact(
	receipt: AdmittedClientComponentInput
): ExactClientComponentArtifact {
	const artifact = registryHydrationContract(receipt.contract).artifact;
	if (artifact.target !== 'client')
		throw new TypeError('Hydration received a non-client component receipt');
	return artifact;
}

/** Constructs the durable instance selected by an adopted component operation. */
export function constructReceipt(
	root: Root,
	receipt: AdmittedClientComponentInput,
	parent: AnyComponentInstance | undefined,
	mounted: Mounted,
	receivingCurrent: () => boolean = () => true
): AnyComponentInstance {
	receipt = clientComponentRecipe(receipt.admitted);
	const artifact = receiptClientArtifact(receipt);
	const prepared = prepareComponentReceiptBinding(mounted, receipt, receivingCurrent);
	if (!prepared.isCurrent()) throw new Error('Component input construction was superseded');
	const inputs = prepared.inputs;
	const props = { ...inputs.props };
	if (inputs.children.length === 1) props.children = inputs.children[0];
	else if (inputs.children.length > 1) props.children = inputs.children;
	const domain = receipt.domain ?? parent?.domain ?? root.domain ?? pageComponentDomain;
	if (!prepared.isCurrent()) throw new Error('Component input construction was superseded');
	prepared.beginDelivery();
	if (root.componentInputAttempt?.operation === receipt.admitted.operation)
		root.componentInputAttempt.deliveryStarted = true;
	return withComponentResumption(domain, () =>
		withEffectScope(mounted.scope, () =>
			artifact.construct(
				parent,
				props,
				parent?.ambientContexts ?? root.ambientContexts,
				domain,
				undefined,
				registryHydrationContract(receipt.contract)
			)
		)
	);
}

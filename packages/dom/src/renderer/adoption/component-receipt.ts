import {
	pageComponentDomain,
	type AnyComponentInstance,
	withComponentResumption
} from '@exactjs/core';
import type {
	ExactClientComponentArtifact,
	ExactComponentReceiptData
} from '@exactjs/core/runtime/component-operations';
import {
	createEffectScope,
	withEffectScope,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import { placeMountedBefore } from '../../placement.js';
import type { Mounted, Root } from '../../types.js';
import { mountComponentReceipt } from '../mounting/native-component-artifact.js';
import { ownMountedInstance } from '../component-mount-ownership.js';
import { unmountMounted } from '../teardown.js';
import { adoptComponentChildren } from './boundaries.js';
import { attachHydratedComponent } from './component-attachment.js';
import { componentMarkerBoundaryByIdentity } from './component-receipt-identity.js';

/** Adopts one opaque receipt through the artifact that issued it. */
export function adoptComponentReceipt(
	root: Root,
	receipt: ExactComponentReceiptData,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	rangeEnd: number,
	omitCompilerOwnedBoundary: boolean
): { mounted: Mounted; next: number } | undefined {
	const scope = createEffectScope(parentScope);
	const boundary = componentMarkerBoundaryByIdentity(
		nodes,
		cursor,
		receipt.contract.artifact.id,
		rangeEnd
	);
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
	const mounted: Mounted = {
		componentReceipt: receipt,
		dom: boundary.start,
		end: nodes[boundary.endIndex]!,
		scope,
		children: [],
		clientArtifact: receiptClientArtifact(receipt)
	};
	try {
		const instance = constructReceipt(root, receipt, parentInstance);
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
		return { mounted, next: boundary.endIndex + 1 };
	} catch {
		unmountMounted(mounted);
		return undefined;
	}
}

function adoptMarkerlessReceipt(
	root: Root,
	receipt: ExactComponentReceiptData,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance | undefined,
	scope: EffectScope,
	rangeEnd: number
): { mounted: Mounted; next: number } | undefined {
	const mounted: Mounted = {
		componentReceipt: receipt,
		dom: document.createTextNode(''),
		scope,
		children: [],
		clientArtifact: receiptClientArtifact(receipt)
	};
	try {
		const instance = constructReceipt(root, receipt, parentInstance);
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
		const first = mounted.children[0]?.dom;
		const last = mounted.children.at(-1);
		const parent = first?.parentNode;
		if (!first || !last || !parent) return undefined;
		const endNode = last.end ?? last.dom;
		parent.insertBefore(mounted.dom, first);
		mounted.end = document.createTextNode('');
		parent.insertBefore(mounted.end, endNode.nextSibling);
		return { mounted, next: adoptedNext };
	} catch {
		unmountMounted(mounted);
		return undefined;
	}
}

/** Returns the client artifact already selected by an opaque component operation. */
export function receiptClientArtifact(
	receipt: ExactComponentReceiptData
): ExactClientComponentArtifact {
	const artifact = receipt.contract.artifact;
	if (artifact.target !== 'client')
		throw new TypeError('Hydration received a non-client component receipt');
	return artifact;
}

/** Constructs the durable instance selected by an adopted component operation. */
export function constructReceipt(
	root: Root,
	receipt: ExactComponentReceiptData,
	parent: AnyComponentInstance | undefined
): AnyComponentInstance {
	const artifact = receiptClientArtifact(receipt);
	const props = { ...receipt.props };
	if (receipt.children.length === 1) props.children = receipt.children[0];
	else if (receipt.children.length > 1) props.children = receipt.children;
	const domain = receipt.domain ?? parent?.domain ?? root.domain ?? pageComponentDomain;
	return withComponentResumption(domain, () =>
		withEffectScope(parent?.scope, () =>
			artifact.construct(
				parent,
				props,
				parent?.ambientContexts ?? root.ambientContexts,
				domain,
				undefined,
				receipt.contract
			)
		)
	);
}

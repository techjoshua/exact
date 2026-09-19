import { refreshComponentRoot } from './component-roots.js';
import { attachSuppressedCleanupFailure, type AnyComponentInstance } from '@exactjs/core';
import {
	createCompiledIntrinsicReceipt,
	createCompiledTargetContributions,
	type ExactFragmentReceiptData,
	type ExactFragmentPresentationHost
} from '@exactjs/core/runtime/component-operations';
import { transferEffectScope } from '@exactjs/reactive/framework/runtime';
import { afterMountedChildren, placeMountedBefore } from '../placement.js';
import type { Mounted, Root } from '../types.js';
import { mountDetachedOperation } from './mounting/children.js';
import { patchChildren } from './patching/children.js';
import { refreshTargetBoundary } from './target-contributions.js';
import {
	attemptTeardown,
	disposeMounted,
	teardownFailure,
	throwTeardownFailure
} from './teardown.js';

type HostMount = { specification: ExactFragmentPresentationHost; boundary: Mounted; host: Mounted };

/**
 * Reconciles generated host topology independently of the fragment's authored child lifetime.
 * Scalar contribution changes do not move nodes. Structural changes retain surviving hosts and
 * transfer child scopes before releasing departed hosts, including the final host on unwrap.
 */
export function patchFragmentPresentation(
	root: Root,
	parent: Node,
	mounted: Mounted,
	next: ExactFragmentReceiptData,
	owner: AnyComponentInstance | undefined
): Mounted {
	const previous = mounted.fragmentReceipt!.presentation!;
	const presentation = next.presentation!;
	const hosts = new Map<object | symbol, HostMount>();
	let children = mounted.children;
	for (const specification of previous.hosts) {
		const boundary = children[0];
		const host = boundary?.children[0];
		if (!boundary?.targetReceipt || !host?.intrinsicReceipt)
			throw new Error('Fragment presentation lost its owned host topology');
		hosts.set(specification.identity, { specification, boundary, host });
		children = host.children;
	}
	for (const specification of presentation.hosts) {
		const existing = hosts.get(specification.identity);
		if (existing && existing.specification.tag !== specification.tag)
			throw new Error('Fragment presentation host tags are fixed for their lifetime');
	}
	const sameTopology =
		previous.hosts.length === presentation.hosts.length &&
		previous.hosts.every((host, index) => host.identity === presentation.hosts[index]!.identity);
	const cursor = afterMountedChildren(mounted);
	const planned: HostMount[] = [];
	const created: HostMount[] = [];
	const departed: HostMount[] = [];
	try {
		for (const specification of presentation.hosts) {
			const existing = hosts.get(specification.identity);
			if (existing) {
				planned.push({ ...existing, specification });
				continue;
			}
			const boundary = mountDetachedOperation(
				root,
				createCompiledTargetContributions(
					specification.contributions,
					createCompiledIntrinsicReceipt(specification.tag, null)
				),
				owner,
				mounted.scope,
				parent
			);
			const entry = { specification, boundary, host: boundary.children[0]! };
			created.push(entry);
			planned.push(entry);
		}
	} catch (error) {
		for (const entry of created) {
			try {
				disposeMounted(parent, entry.boundary);
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
		}
		throw error;
	}
	if (!sameTopology) {
		// Detach logical ownership before teardown can stop any retained descendant scope.
		for (const entry of hosts.values()) entry.host.children = [];
		for (const entry of hosts.values()) transferEffectScope(entry.boundary.scope, mounted.scope);
		for (const child of children) transferEffectScope(child.scope, mounted.scope);
		// A former ancestor may become a descendant. Separate physical ranges before nesting them
		// in the new order, otherwise inserting a retained host can create a DOM parent cycle.
		const staging = mounted.dom.ownerDocument!.createDocumentFragment();
		for (const child of children) placeMountedBefore(root, staging, child);
		for (const entry of [...hosts.values()].reverse())
			placeMountedBefore(root, staging, entry.boundary);
		let inner = children;
		for (let index = planned.length - 1; index >= 0; index--) {
			const entry = planned[index]!;
			entry.host.children = inner;
			for (const child of inner) {
				transferEffectScope(child.scope, entry.host.scope);
				placeMountedBefore(root, entry.host.dom, child);
			}
			inner = [entry.boundary];
		}
		mounted.children = inner;
		for (const child of inner) {
			transferEffectScope(child.scope, mounted.scope);
			placeMountedBefore(root, parent, child, cursor);
		}
		const retained = new Set(presentation.hosts.map((host) => host.identity));
		for (const [identity, entry] of hosts) {
			if (!retained.has(identity)) departed.push(entry);
		}
	}
	mounted.fragmentReceipt = next;
	const innermost = planned.at(-1)?.host ?? mounted;
	const childParent = innermost === mounted ? parent : innermost.dom;
	const failure = teardownFailure();
	attemptTeardown(failure, () => {
		innermost.children = patchChildren(
			root,
			childParent,
			children,
			[presentation.target],
			owner,
			innermost.scope,
			innermost === mounted ? cursor : undefined,
			innermost
		);
	});
	for (const entry of planned) {
		entry.boundary.targetReceipt = {
			...entry.boundary.targetReceipt!,
			contributions: entry.specification.contributions
		};
		attemptTeardown(failure, () => refreshTargetBoundary(root, entry.boundary, owner));
	}
	for (const entry of departed)
		attemptTeardown(failure, () =>
			disposeMounted(entry.boundary.dom.parentNode ?? parent, entry.boundary)
		);
	if (!sameTopology) {
		const owners = new Set(
			presentation.hosts.flatMap((host) =>
				host.contributions
					.map((contribution) => contribution.owner)
					.filter((owner): owner is AnyComponentInstance => owner !== undefined)
			)
		);
		for (const contributor of [...owners].reverse())
			attemptTeardown(failure, () => refreshComponentRoot(contributor));
	}
	throwTeardownFailure(failure);
	return mounted;
}

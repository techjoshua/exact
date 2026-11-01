import {
	attachSuppressedCleanupFailure,
	attemptCleanup,
	createCleanupFailure,
	throwCleanupFailure
} from '@exactjs/core';
import { disposeReactRendererComponent } from '@exactjs/react-compat/exact';
import { releaseReactHostProps } from './host-properties.js';
import { removeReactRange } from './range.js';
import type { ReactMounted } from './types.js';

/** Releases a sibling forest completely, preserving the first error and retiring parents before children. Retained roots are skipped. */
export function disposeReactMounts(
	mounts: readonly ReactMounted[],
	retained?: ReadonlySet<ReactMounted>
): void {
	const failure = createCleanupFailure();
	const pending: Array<ReactMounted | undefined> = [];
	for (let index = mounts.length - 1; index >= 0; index--)
		if (!retained?.has(mounts[index]!)) pending.push(mounts[index]!);
	while (pending.length) {
		const mounted = pending.pop();
		if (!mounted) {
			const finished = pending.pop()!;
			attemptCleanup(failure, () => removeReactRange(finished));
			continue;
		}
		if (mounted.disposed) continue;
		mounted.disposed = true;
		if (mounted.kind === 'host')
			attemptCleanup(failure, () => releaseReactHostProps(mounted.dom as Element));
		attemptCleanup(failure, () => mounted.releaseComponentDomNode?.());
		if (mounted.instance)
			attemptCleanup(failure, () => disposeReactRendererComponent(mounted.instance!));
		attemptCleanup(failure, () => mounted.releaseSuspenseTransition?.());
		if (mounted.nativeRange) attemptCleanup(failure, () => mounted.nativeRange!.dispose());
		pending.push(mounted, undefined);
		for (let index = mounted.children.length - 1; index >= 0; index--)
			pending.push(mounted.children[index]!);
	}
	throwCleanupFailure(failure);
}

/** Releases failed preparation's newly acquired ranges without replacing the initiating failure. */
export function rollbackReactMounts(mounts: readonly ReactMounted[], primary: unknown): never {
	try {
		disposeReactMounts(mounts);
	} catch (cleanup) {
		attachSuppressedCleanupFailure(primary, cleanup);
	}
	throw primary;
}

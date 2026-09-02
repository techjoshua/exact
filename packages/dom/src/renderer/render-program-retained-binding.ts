import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render-operations';
import { type OwnedRetainedWatch, watchRetained } from '@exactjs/reactive/framework/watch';
import type { Mounted } from '../types.js';

/** Mutable target shared by focused render-program operations during one binding transaction. */
export type ProgramBindingTarget = ExactRenderProgramBindingTarget & {
	readonly mounted: Mounted;
	readonly initialBinding: boolean;
	readonly stopBindings: OwnedRetainedWatch[];
	valid: boolean;
};

/** Installs one owned watcher and transfers its cleanup to the binding transaction. */
export function retainProgramBinding(context: ProgramBindingTarget, apply: () => void): void {
	const watcher = watchRetained(apply, undefined, {
		scope: context.mounted.scope,
		owned: true
	});
	if (watcher) context.stopBindings.push(watcher);
}

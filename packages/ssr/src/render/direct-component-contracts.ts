import type { AnyComponentInstance, VNode } from '@exactjs/core';
import type { DirectSsrComponentSnapshot, SsrContext } from '../types.js';
import type { DirectSsrComponentContent } from './direct-component-content.js';

/** Cleanup boundary for eagerly issued compiler-proven descendant task frames. */
export type DirectScheduledPreparation = AsyncDisposable;

/** Completed setup and render result awaiting successful descendant serialization. */
export type DirectSsrComponentResult = Readonly<{
	content: DirectSsrComponentContent;
	owner: AnyComponentInstance | undefined;
	preparation?: DirectScheduledPreparation;
	props: Record<string, unknown>;
	snapshot: DirectSsrComponentSnapshot;
}>;

/** Render output paired with ownership for child work issued during VNode materialization. */
export type DirectIssuedRender = Readonly<{
	content: DirectSsrComponentContent;
	preparation?: DirectScheduledPreparation;
}>;

/** Request-local scheduled component whose task graph is drained between render attempts. */
export type DirectScheduledSsrComponent = AsyncDisposable &
	Readonly<{
		owner: AnyComponentInstance | undefined;
		props: Record<string, unknown>;
		snapshot: DirectSsrComponentSnapshot;
		render(): DirectIssuedRender | Promise<DirectIssuedRender>;
		/** Returns whether blocking work existed and the completed output must be rendered again. */
		drain(): Promise<boolean>;
	}>;

/** Request-local scheduled frame issued before its serial HTML position is published. */
export type PreparedDirectScheduledSsrComponent = Readonly<{
	component: Promise<DirectScheduledSsrComponent | undefined>;
	consumed: boolean;
	vnode: VNode;
}>;

/** Publishes stabilized direct-component HTML through the formatting selected by its renderer. */
export type DirectSsrComponentPublisher<Publication = undefined> = (
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	html: string,
	props: Record<string, unknown>,
	snapshot: DirectSsrComponentSnapshot,
	publication: Publication
) => string;

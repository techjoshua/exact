import type { AnyComponentInstance } from '@exactjs/core';
import type { DirectSsrComponentSnapshot, SsrContext } from '../types.js';
import type { ServerComponentReference } from './server-component-reference.js';
import type { DirectSsrComponentContent } from './direct-component-content.js';
import type {
	DirectSsrComponentFrame,
	DirectSsrLifecycleCapability
} from './direct-component-support.js';

/** Request-local direct frame paired with its compiler-linked lifecycle operations. */
export type DirectSsrComponentLifetime = Readonly<{
	frame: DirectSsrComponentFrame;
	lifecycle: DirectSsrLifecycleCapability;
}>;

/** Cleanup boundary for eagerly issued compiler-proven descendant task frames. */
export type DirectScheduledPreparation = AsyncDisposable;

/** Render output paired with ownership for child work issued during operation materialization. */
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
	reference: ServerComponentReference;
}>;

/** Publishes stabilized direct-component HTML through the formatting selected by its renderer. */
export type DirectSsrComponentPublisher<Publication = undefined> = (
	context: SsrContext,
	reference: ServerComponentReference,
	parent: AnyComponentInstance | undefined,
	html: string,
	props: Record<string, unknown>,
	snapshot: DirectSsrComponentSnapshot,
	publication: Publication
) => string;

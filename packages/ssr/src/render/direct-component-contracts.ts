import type { AnyComponentInstance } from '@exactjs/core';
import type { DirectSsrComponentSnapshot, SsrContext } from '../types.js';
import type { DirectSsrComponentContent } from './direct-component-content.js';
import type {
	DirectSsrComponentFrame,
	DirectSsrLifecycleCapability
} from './direct-component-support.js';
import type { ServerComponentReference } from './server-component-reference.js';

/** Request-local direct frame paired with its compiler-linked lifecycle operations. */
export type DirectSsrComponentLifetime = Readonly<{
	frame: DirectSsrComponentFrame;
	lifecycle: DirectSsrLifecycleCapability;
}>;

/** Cleanup boundary for eagerly issued compiler-proven descendant task frames. */
export type DirectScheduledPreparation = AsyncDisposable & {
	/** Actual ordered output owned by this preparation, carried through its writer. */
	readonly frame?: ComponentInputOutputFrame;
};

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
		/** Checks for successful task publication since this attempt read its render values. */
		publicationChanged(): boolean;
		/** Returns whether blocking work existed and the completed output must be rendered again. */
		drain(): boolean | Promise<boolean>;
	}>;

/** Request-local scheduled frame issued before its serial HTML position is published. */
export type PreparedDirectScheduledSsrComponent = Readonly<{
	component:
		| DirectScheduledSsrComponent
		| Promise<DirectScheduledSsrComponent | undefined>
		| undefined;
	inputs: import('./server-component-reference.js').ComponentExecutionInputRecord;
	parent: AnyComponentInstance | undefined;
	reserved?: true;
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

/** Ordered actual output retained through server-slot traversal, never recovered by raw identity. */
export type ComponentInputOutputFrame = {
	readonly entries: readonly (
		| Readonly<{ position: number; kind: 'component'; record: PreparedDirectScheduledSsrComponent }>
		| Readonly<{
				kind: 'slot';
				position: number;
				source: object;
				values: readonly unknown[];
				parent: AnyComponentInstance | undefined;
				frame: ComponentInputOutputFrame;
		  }>
	)[];
	cursor: number;
	previous?: ComponentInputOutputFrame;
};

/** Existing traversal or writer boundary owns its prefix before any authored acquisition. */
export interface DirectScheduledPreparationOwner {
	/** Preparation remains reachable even when its synchronous walk throws. */
	preparation?: DirectScheduledPreparation;
}

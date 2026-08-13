import type { ReactiveValue } from '@exactjs/reactive';

/** Defines the task resource disposal type contract. */
export type TaskResourceDisposal = string;
/** Defines the task cleanup type contract. */
export type TaskCleanup = (reason?: unknown) => void | Promise<void>;
/** Defines the task idle deadline type contract. */
export type TaskIdleDeadline = { readonly didTimeout: boolean; timeRemaining(): number };
/** Configures task idle. */
export type TaskIdleOptions = { timeout?: number };
/** Defines the component reactive value type contract. */
export type ComponentReactiveValue<T> = ReactiveValue<T>;
/** Defines the iterable item type contract. */
export type IterableItem<T> = T extends Iterable<infer Item> ? Item : never;

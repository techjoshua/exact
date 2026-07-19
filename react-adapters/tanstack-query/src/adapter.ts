import { createContext, type Child, type Component } from '@exact/core';
import { createExternalSource, type ExternalSource, type ReactiveValue } from '@exact/reactive';
import {
	InfiniteQueryObserver,
	MutationObserver,
	QueryObserver,
	type DefaultError,
	type InfiniteQueryObserverOptions,
	type InfiniteQueryObserverResult,
	type MutationObserverOptions,
	type MutationObserverResult,
	type QueryClient,
	type QueryKey,
	type QueryObserverOptions,
	type QueryObserverResult
} from '@tanstack/query-core';

export { dehydrate, hydrate, MutationCache, QueryCache, QueryClient } from '@tanstack/query-core';
export type {
	DehydratedState,
	InfiniteQueryObserverOptions,
	InfiniteQueryObserverResult,
	MutationObserverOptions,
	MutationObserverResult,
	QueryKey,
	QueryObserverOptions,
	QueryObserverResult
} from '@tanstack/query-core';

/** Opaque context: QueryClient must retain class/private-field identity. */
export const QueryClientContext = createContext<QueryClient>('exact.tanstack-query.client', {
	reactive: false
});

/** Defines the properties accepted by exact query client provider. */
export interface ExactQueryClientProviderProps {
	readonly client: QueryClient;
	readonly children?: Child | readonly Child[];
}

/** Performs the exact query client provider domain operation. */
export function ExactQueryClientProvider(
	this: Component<Record<string, unknown>>,
	props: ExactQueryClientProviderProps
) {
	this.setContext(QueryClientContext, props.client);
	return () => props.children ?? null;
}

/** Defines the exact query source interface contract. */
export interface ExactQuerySource<TData = unknown, TError = DefaultError> {
	readonly observer: QueryObserver<any, TError, TData, any, any>;
	readonly result: ReactiveValue<QueryObserverResult<TData, TError>>;
	readonly external: ExternalSource<QueryObserverResult<TData, TError>>;
	setOptions(options: QueryObserverOptions<any, TError, TData, any, any>): void;
	dispose(): void;
}

/** Defines the exact observer source interface contract. */
export interface ExactObserverSource<TResult, TOptions, TObserver> {
	readonly observer: TObserver;
	readonly result: ReactiveValue<TResult>;
	readonly external: ExternalSource<TResult>;
	setOptions(options: TOptions): void;
	dispose(): void;
}

/** Creates a native reactive view of a TanStack Query core observer. */
export function createQuerySource<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey
>(
	client: QueryClient,
	options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>
): ExactQuerySource<TData, TError> {
	return createObserverSource(new QueryObserver(client, options)) as ExactQuerySource<
		TData,
		TError
	>;
}

/** Native infinite-query observer integration backed only by query-core. */
export function createInfiniteQuerySource(
	client: QueryClient,
	options: InfiniteQueryObserverOptions<any, any, any, any, any>
): ExactObserverSource<
	InfiniteQueryObserverResult<any, any>,
	InfiniteQueryObserverOptions<any, any, any, any, any>,
	InfiniteQueryObserver<any, any, any, any, any>
> {
	return createObserverSource(new InfiniteQueryObserver(client, options));
}

/** Native mutation observer integration backed only by query-core. */
export function createMutationSource(
	client: QueryClient,
	options: MutationObserverOptions<any, any, any, any>
): ExactObserverSource<
	MutationObserverResult<any, any, any, any>,
	MutationObserverOptions<any, any, any, any>,
	MutationObserver<any, any, any, any>
> {
	return createObserverSource(new MutationObserver(client, options));
}

function createObserverSource<
	TResult,
	TOptions,
	TObserver extends {
		getCurrentResult(): TResult;
		subscribe(listener: (result: TResult) => void): () => void;
		setOptions(options: TOptions): void;
	}
>(observer: TObserver): ExactObserverSource<TResult, TOptions, TObserver> {
	const external = createExternalSource<TResult>({
		getSnapshot: () => observer.getCurrentResult(),
		subscribe: (notify) => observer.subscribe(() => notify())
	});
	return Object.freeze({
		observer,
		result: external.value,
		external,
		setOptions(next: TOptions) {
			observer.setOptions(next);
			external.refresh();
		},
		dispose: () => external.dispose()
	});
}

/** Creates and lifecycle-owns a query source from the nearest provider. */
export function createComponentQuery<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey
>(
	component: Component<any>,
	options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>
): ExactQuerySource<TData, TError> {
	const source = createQuerySource(component.getContext(QueryClientContext), options);
	component.onUnmount(source.dispose);
	return source;
}

import { createContext, markExactComponent, type Child, type Component } from '@exactjs/core';
import { createExternalSource, type ExternalSource, type ReactiveValue } from '@exactjs/reactive';
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
markExactComponent(ExactQueryClientProvider, '@exactjs/tanstack-query:ExactQueryClientProvider');

/** Defines the exact query source interface contract. */
export interface ExactQuerySource<
	TData = unknown,
	TError = DefaultError,
	TQueryFnData = TData,
	TQueryData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey
> {
	readonly observer: QueryObserver<TQueryFnData, TError, TData, TQueryData, TQueryKey>;
	readonly result: ReactiveValue<QueryObserverResult<TData, TError>>;
	readonly external: ExternalSource<QueryObserverResult<TData, TError>>;
	setOptions(
		options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>
	): void;
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
): ExactQuerySource<TData, TError, TQueryFnData, TQueryData, TQueryKey> {
	return createObserverSource(new QueryObserver(client, options));
}

/** Native infinite-query observer integration backed only by query-core. */
export function createInfiniteQuerySource<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown
>(
	client: QueryClient,
	options: InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>
): ExactObserverSource<
	InfiniteQueryObserverResult<TData, TError>,
	InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
	InfiniteQueryObserver<TQueryFnData, TError, TData, TQueryKey, TPageParam>
> {
	return createObserverSource(new InfiniteQueryObserver(client, options));
}

/** Native mutation observer integration backed only by query-core. */
export function createMutationSource<
	TData = unknown,
	TError = DefaultError,
	TVariables = void,
	TOnMutateResult = unknown
>(
	client: QueryClient,
	options: MutationObserverOptions<TData, TError, TVariables, TOnMutateResult>
): ExactObserverSource<
	MutationObserverResult<TData, TError, TVariables, TOnMutateResult>,
	MutationObserverOptions<TData, TError, TVariables, TOnMutateResult>,
	MutationObserver<TData, TError, TVariables, TOnMutateResult>
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
	component: Component<Record<string, unknown>>,
	options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>
): ExactQuerySource<TData, TError, TQueryFnData, TQueryData, TQueryKey> {
	const source = createQuerySource(component.getContext(QueryClientContext), options);
	component.onUnmount(source.dispose);
	return source;
}

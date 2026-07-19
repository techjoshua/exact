import {
	Activity,
	Fragment,
	Profiler,
	StrictMode,
	Suspense,
	ViewTransition,
	__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
	__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
	version
} from './api/constants.js';
import { act, unstable_act } from './api/act.js';
import { cache, cacheSignal, captureOwnerStack } from './api/cache.js';
import { Component, PureComponent } from './api/classes.js';
import { createContext, createRef, forwardRef, lazy, memo } from './api/components.js';
import { Children, cloneElement, createElement, isValidElement } from './api/elements.js';
import {
	startTransition,
	use,
	useActionState,
	useCallback,
	useContext,
	useDebugValue,
	useDeferredValue,
	useEffect,
	useEffectEvent,
	useId,
	useImperativeHandle,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useOptimistic,
	useReducer,
	useRef,
	useState,
	useSyncExternalStore,
	useTransition
} from './api/hooks.js';
import { addTransitionType, createFactory, unstable_useCacheRefresh } from './api/unsupported.js';

export * from './api/act.js';
export * from './api/cache.js';
export * from './api/classes.js';
export * from './api/components.js';
export * from './api/constants.js';
export * from './api/elements.js';
export * from './api/hooks.js';
export * from './api/unsupported.js';
export { withReactProfile } from './internals.js';
export type { ReactCompatibilityProfileEvent } from './internals.js';
export type * from './types.js';

const React = {
	__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
	__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
	Activity,
	Children,
	Component,
	Fragment,
	Profiler,
	PureComponent,
	StrictMode,
	Suspense,
	ViewTransition,
	act,
	addTransitionType,
	cache,
	cacheSignal,
	captureOwnerStack,
	cloneElement,
	createContext,
	createElement,
	createFactory,
	createRef,
	forwardRef,
	isValidElement,
	lazy,
	memo,
	startTransition,
	use,
	useActionState,
	useCallback,
	useContext,
	useDebugValue,
	useDeferredValue,
	useEffect,
	useEffectEvent,
	useId,
	useImperativeHandle,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useOptimistic,
	useReducer,
	useRef,
	useState,
	useSyncExternalStore,
	useTransition,
	unstable_act,
	unstable_useCacheRefresh,
	version
};

export default React;

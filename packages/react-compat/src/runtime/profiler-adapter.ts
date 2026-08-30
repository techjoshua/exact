import type { Component, ComponentFunction } from '@exactjs/core';
import type { ReactNode } from '../types.js';
import { routeClassLifecycleError } from './class-support.js';

/** Precompiled React Profiler behavior executed by the common island artifact. */
export const ReactProfilerIslandImplementation = function ReactProfilerIsland(
	this: Component<Record<string, unknown>>,
	props: Record<string, unknown> & { component: symbol }
) {
	let mounted = false;
	this.onMount(() => {
		mounted = true;
	});
	this.onRender(({ duration }) => {
		const callback = props.onRender;
		if (typeof callback !== 'function') return;
		const phase = mounted ? 'update' : 'mount';
		const commitTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
		queueMicrotask(() => {
			try {
				(callback as (...args: unknown[]) => void)(
					props.id,
					phase,
					duration,
					duration,
					commitTime - duration,
					commitTime
				);
			} catch (error) {
				routeClassLifecycleError(this, error, 'profiler');
			}
		});
	});
	return () => props.children as ReactNode;
} as ComponentFunction<Record<string, unknown>, Record<string, unknown> & { component: symbol }>;

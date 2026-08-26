import type { LifecycleHandler, RenderEventHandler } from '@exactjs/core';
import type {
	DirectSsrComponentFrame,
	DirectSsrLifecycleCapability
} from '../render/direct-component-support.js';

type DirectSsrLifecycleRecord = {
	render?: RenderEventHandler[];
	unmount?: LifecycleHandler[];
	pending?: Promise<void>[];
	disposed?: boolean;
};

const records = new WeakMap<DirectSsrComponentFrame, DirectSsrLifecycleRecord>();

function record(frame: DirectSsrComponentFrame): DirectSsrLifecycleRecord {
	let value = records.get(frame);
	if (!value) {
		value = {};
		records.set(frame, value);
	}
	return value;
}

function observe(record: DirectSsrLifecycleRecord, value: unknown): void {
	if (!value || typeof (value as PromiseLike<unknown>).then !== 'function') return;
	const pending = Promise.resolve(value).then(() => undefined);
	(pending as Promise<void>).catch(() => undefined);
	(record.pending ??= []).push(pending);
}

/** Registers a compiler-proven server unmount callback on its request-local direct frame. */
export function registerDirectSsrLifecycleHandler(
	frame: DirectSsrComponentFrame,
	_phase: 'unmount',
	handler: LifecycleHandler
): void {
	(record(frame).unmount ??= []).push(handler);
}

/** Registers a compiler-proven server render observer on its request-local direct frame. */
export function registerDirectSsrRenderHandler(
	frame: DirectSsrComponentFrame,
	handler: RenderEventHandler
): void {
	(record(frame).render ??= []).push(handler);
}

/** Transfers one compiler-proven disposable to the request-local direct frame. */
export function ownDirectSsrResource<
	T extends Disposable | AsyncDisposable | { dispose(): unknown }
>(frame: DirectSsrComponentFrame, resource: T): T {
	registerDirectSsrLifecycleHandler(frame, 'unmount', () => {
		if ('dispose' in resource) return resource.dispose();
		if (Symbol.dispose in resource) return resource[Symbol.dispose]();
		return resource[Symbol.asyncDispose]();
	});
	return resource;
}

function rendered(frame: DirectSsrComponentFrame, duration: number): void {
	const value = records.get(frame);
	if (!value || value.disposed) return;
	const failures: unknown[] = [];
	for (const handler of value.render ?? []) {
		try {
			observe(value, handler({ duration }));
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length) throw new AggregateError(failures, 'Direct SSR render lifecycle failed');
}

function dispose(frame: DirectSsrComponentFrame, reason: string): void | Promise<void> {
	const value = records.get(frame);
	if (!value || value.disposed) return;
	value.disposed = true;
	records.delete(frame);
	const failures: unknown[] = [];
	const signal = AbortSignal.abort(reason);
	for (const handler of value.unmount ?? []) {
		try {
			observe(value, handler({ signal, reason }));
		} catch (error) {
			failures.push(error);
		}
	}
	const pending = value.pending;
	value.render = undefined;
	value.unmount = undefined;
	value.pending = undefined;
	if (!pending?.length) {
		if (failures.length) throw new AggregateError(failures, 'Direct SSR cleanup failed');
		return;
	}
	return Promise.allSettled(pending).then((settlements) => {
		for (const settlement of settlements)
			if (settlement.status === 'rejected') failures.push(settlement.reason);
		if (failures.length) throw new AggregateError(failures, 'Direct SSR cleanup failed');
	});
}

/** Artifact-linked lifecycle operations for a compiler-specialized direct server component. */
export const directSsrLifecycle = Object.freeze({ rendered, dispose }) satisfies DirectSsrLifecycleCapability;

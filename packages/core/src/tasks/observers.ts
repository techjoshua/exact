import type { AnyComponentInstance, TaskObserver } from '../component/contracts.js';

const taskObserverStack: TaskObserver[] = [];
const retainedTaskObservers = new WeakMap<AnyComponentInstance, TaskObserver>();

/** Returns the observer that currently owns work for a component. */
export function taskObserverFor(instance: AnyComponentInstance): TaskObserver | undefined {
	return taskObserverStack[taskObserverStack.length - 1] ?? retainedTaskObservers.get(instance);
}

/** Retains an observer for renderer-owned component work. */
export function retainTaskObserver(instance: AnyComponentInstance, observer: TaskObserver): void {
	retainedTaskObservers.set(instance, observer);
}

/** Releases renderer-owned observation when a component unmounts. */
export function releaseTaskObserver(instance: AnyComponentInstance): void {
	retainedTaskObservers.delete(instance);
}

/** Registers promise settlement with the current component observer. */
export function observeTaskPromise(
	promise: Promise<unknown>,
	instance: AnyComponentInstance
): void {
	taskObserverFor(instance)?.register(promise, instance);
}

/** Runs work with a task observer installed for nested component construction. */
export function withTaskObserver<T>(observer: TaskObserver | undefined, fn: () => T): T {
	if (!observer) return fn();
	taskObserverStack.push(observer);
	try {
		return fn();
	} finally {
		taskObserverStack.pop();
	}
}

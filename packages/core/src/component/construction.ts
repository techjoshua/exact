import type { ComponentInstance } from './contracts.js';

/** Releases partial ownership after component setup throws before construction completes. */
export function cleanupFailedComponentConstruction(instance: ComponentInstance<any>): void {
	instance.renderStop?.();
	instance.scope.stop();
	instance.mountController?.abort('construct-failed');
	for (const task of instance.tasks) task.stop();
}

/** Distinguishes a tagged-template invocation from an ordinary state-path read. */
export function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
	return Array.isArray(value) && Array.isArray((value as { raw?: unknown }).raw);
}

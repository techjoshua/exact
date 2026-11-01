import { createErrorReport, handleComponentError, type AnyComponentInstance } from '@exactjs/core';

/** Runs scheduled React work under its durable error owner, preserving thrown values and commit failure context. */
export function runReactOwnedWork(instance: AnyComponentInstance, operation: () => void): void {
	try {
		operation();
	} catch (error) {
		handleComponentError(instance, createErrorReport(error, 'lifecycle', instance, 'commit'));
	}
}

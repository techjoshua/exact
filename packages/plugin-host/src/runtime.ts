import type {
	ExactOutputContext,
	ExactOutputExtension,
	ExactPluginLifecycleContext,
	ExactPluginResource,
	ExactRuntimePluginExtension
} from '@exact/plugin-api';

/** Performs the process exact output domain operation. */
export async function processExactOutput<T>(
	value: T,
	context: ExactOutputContext,
	extensions: readonly ExactOutputExtension<T>[]
): Promise<T> {
	let current = value;
	for (const extension of extensions) {
		if (extension.transform) current = await extension.transform(current, context);
	}
	const failures: unknown[] = [];
	for (const extension of extensions) {
		if (!extension.validate) continue;
		try {
			const result = await extension.validate(current, context);
			if (result !== undefined) failures.push(new Error('Output validators must return undefined'));
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length)
		throw new AggregateError(failures, `eXact ${context.kind} output validation failed`);
	return current;
}

/** Performs the process exact output sync domain operation. */
export function processExactOutputSync<T>(
	value: T,
	context: ExactOutputContext,
	extensions: readonly ExactOutputExtension<T>[]
): T {
	let current = value;
	for (const extension of extensions) {
		if (!extension.transform) continue;
		const result = extension.transform(current, context);
		if (isPromiseLike(result))
			throw new Error(`Async output transform cannot run in synchronous ${context.kind} output`);
		current = result;
	}
	const failures: unknown[] = [];
	for (const extension of extensions) {
		if (!extension.validate) continue;
		try {
			const result = extension.validate(current, context);
			if (isPromiseLike(result))
				throw new Error(`Async output validator cannot run in synchronous ${context.kind} output`);
			if (result !== undefined) failures.push(new Error('Output validators must return undefined'));
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length)
		throw new AggregateError(failures, `eXact ${context.kind} output validation failed`);
	return current;
}

/** Performs the initialize exact plugin resources domain operation. */
export async function initializeExactPluginResources(
	extensions: readonly ExactRuntimePluginExtension[],
	scope: 'application' | 'request',
	context: ExactPluginLifecycleContext
): Promise<ExactPluginResource[]> {
	const resources: ExactPluginResource[] = [];
	try {
		for (const extension of extensions) {
			const factory =
				scope === 'application' ? extension.initializeApplication : extension.initializeRequest;
			const resource = await factory?.(context);
			if (resource) resources.push(resource);
		}
		return resources;
	} catch (error) {
		await disposeExactPluginResources(resources);
		throw error;
	}
}

/** Releases exact plugin resources and its owned resources. */
export async function disposeExactPluginResources(
	resources: readonly ExactPluginResource[]
): Promise<void> {
	const failures: unknown[] = [];
	for (const resource of [...resources].reverse()) {
		try {
			await resource.dispose();
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length) throw new AggregateError(failures, 'eXact plugin resource disposal failed');
}

/** Validates exact runtime extensions and throws when the contract is violated. */
export async function validateExactRuntimeExtensions(
	extensions: readonly ExactRuntimePluginExtension[]
): Promise<void> {
	for (const extension of extensions) {
		const result = await extension.validate?.();
		if (result !== undefined) throw new Error('Runtime plugin validate() must return undefined');
	}
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		!!value &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}

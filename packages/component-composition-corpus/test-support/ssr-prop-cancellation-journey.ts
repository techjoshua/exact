type Source = ReturnType<typeof import('@exactjs/core').createContinuationDependencySlot>;
type Prepare = (
	props: Record<string, unknown>,
	deferred: readonly string[] | undefined,
	options: { signal?: AbortSignal }
) => Record<string, unknown> | Promise<Record<string, unknown>>;
type Api = {
	createContinuationDependencySlot(): Source;
	markContinuationDependencyValue<T>(value: T, source: Source): T;
	prepareComponentProps: Prepare;
	prepareDirectComponentProps: Prepare;
};

/** Preserves cancellation and failure identity while preparing compiler-forwarded prop sources. */
export async function verifySsrPropCancellation(api: Api): Promise<void> {
	for (const prepare of [api.prepareComponentProps, api.prepareDirectComponentProps]) {
		for (const reason of [null, false, 0, 'cancelled', new Error('cancelled')]) {
			for (const settled of [true, false]) {
				const source = api.createContinuationDependencySlot();
				const generation = source.beginGeneration();
				const value = api.markContinuationDependencyValue({}, source);
				if (settled) source.cancel(generation, reason);
				let caught: unknown = Symbol('not rejected');
				try {
					const prepared = prepare({ value }, undefined, {});
					if (!settled) source.cancel(generation, reason);
					await prepared;
				} catch (error) {
					caught = error;
				}
				if (caught !== reason)
					throw new Error('SSR prop preparation lost exact cancellation reason', { cause: caught });
				const next = source.beginGeneration();
				source.publish(next, 'ready');
				if ((await prepare({ value }, undefined, {})).value !== 'ready')
					throw new Error('SSR prop preparation did not recover');
			}
		}
	}
}

/** Releases pending prop waits if another prop cannot be prepared, without canceling shared sources. */
export async function verifySsrPropPreparationCleanup(api: Api): Promise<void> {
	for (const prepare of [api.prepareComponentProps, api.prepareDirectComponentProps]) {
		for (const mode of ['getter', 'dependency']) {
			let subscriptions = 0;
			const source = api.createContinuationDependencySlot();
			const subscribe = source.subscribe.bind(source);
			source.subscribe = (notify) => {
				subscriptions++;
				const handle = subscribe(notify);
				return {
					[Symbol.dispose]() {
						subscriptions--;
						handle[Symbol.dispose]();
					}
				};
			};
			const generation = source.beginGeneration();
			const value = api.markContinuationDependencyValue({}, source);
			const failure = new Error('prop preparation failed');
			let caught: unknown = Symbol('not rejected');
			try {
				if (mode === 'getter') {
					const props = {
						value,
						get invalid() {
							throw failure;
						}
					};
					await prepare(props, undefined, {});
				} else {
					const other = api.createContinuationDependencySlot();
					const otherGeneration = other.beginGeneration();
					const prepared = prepare(
						{ value, other: api.markContinuationDependencyValue({}, other) },
						undefined,
						{}
					);
					other.fail(otherGeneration, failure);
					await prepared;
				}
			} catch (error) {
				caught = error;
			}
			const retained = subscriptions;
			// Drive the abandoned source so leaked promises cannot hide indefinitely behind a pending gate.
			source.cancel(generation, new Error('late prop cancellation'));
			await new Promise((resolve) => setTimeout(resolve, 0));
			if (caught !== failure || retained !== 0)
				throw new Error('Failed SSR preparation retained a prop wait');
			const next = source.beginGeneration();
			source.publish(next, 'shared source remains usable');
			if ((await prepare({ value }, undefined, {})).value !== 'shared source remains usable')
				throw new Error('Cleanup canceled a shared prop source');
		}
	}
}

/** Keeps progressive production cancellation primary when rendering unwinds with another failure. */
export async function verifyProgressiveUnwindCancellation(api: {
	produceProgressiveHtml: typeof import('../../ssr/src/stream/production.js').produceProgressiveHtml;
}): Promise<void> {
	for (const reason of [null, false, 0, 'cancelled', new Error('cancelled')]) {
		const controller = new AbortController();
		const laterFailure = new Error('render unwound after cancellation');
		let caught: unknown = Symbol('not rejected');
		let writes = 0;
		let unwound = false;
		try {
			await api.produceProgressiveHtml(
				async () => {
					try {
						controller.abort(reason);
						throw laterFailure;
					} finally {
						unwound = true;
					}
				},
				{},
				() => {
					writes++;
				},
				controller
			);
		} catch (error) {
			caught = error;
		}
		if (caught !== reason || writes || !unwound)
			throw new Error('Progressive unwind replaced cancellation or published after abort');
	}
}

/** Edits computed diagnostics while the owned graph continues to invalidate and settle normally. */
export function verifyComputedObservationValues({
	reactive,
	computed,
	inspectComputed,
	createEffectScope,
	withEffectScope
}) {
	const scope = createEffectScope();
	try {
		const state = reactive({ value: 1 });
		const value = withEffectScope(scope, () => computed(() => state.value * 2));
		const unread = inspectComputed(value);
		if (!unread || !Reflect.set(unread, 'initialized', true) || inspectComputed(value).initialized)
			throw new Error('Computed inspection is frozen or edits its graph');
		if (value.get() !== 2) throw new Error('Computed initial value changed');
		const inspected = inspectComputed(value);
		if (!Reflect.set(inspected, 'state', 'stopped') || !Reflect.set(inspected, 'sources', 999))
			throw new Error('Computed inspection rejects ordinary aliases');
		state.value = 2;
		if (
			value.get() !== 4 ||
			inspectComputed(value).sources !== 1 ||
			inspectComputed(value).state === 'stopped'
		)
			throw new Error('Computed inspection edits changed graph ownership');
		scope.stop();
		if (inspectComputed(value).state !== 'stopped') throw new Error('Computed scope did not stop');
	} finally {
		scope.stop();
	}
}

/** Edits diagnostic entry records and lists while finite registry membership and identity stay private. */
export function verifyRegistryObservationValues(
	{ inspectComponentRegistry, hasComponent },
	registry
) {
	const snapshot = inspectComponentRegistry(registry);
	const id = snapshot.id;
	const keys = snapshot.entries.map((entry) => entry.key);
	if (
		!keys.length ||
		!Reflect.set(snapshot, 'id', 'edited') ||
		!Reflect.set(snapshot.entries[0], 'key', 'forged')
	)
		throw new Error('Registry inspection rejects ordinary record aliases');
	snapshot.entries.length = 0;
	const current = inspectComponentRegistry(registry);
	if (
		current.id !== id ||
		current.entries.map((entry) => entry.key).join(',') !== keys.join(',') ||
		!keys.every((key) => hasComponent(registry, key)) ||
		hasComponent(registry, 'forged')
	)
		throw new Error('Registry observation edits changed private membership');
}

/** Edits recorded metadata copies without changing the inputs passed to transport and observation capture. */
export async function verifyRecorderObservationValues({ ExactProtocolRecorder }) {
	const recorder = new ExactProtocolRecorder();
	const headers = { 'x-owner': 'original' };
	const fetch = recorder.wrap(async (_input, init) => {
		if (init.headers !== headers) throw new Error('Recorder replaced transport inputs');
		return { ok: true, status: 200, json: async () => ({ ok: true }) };
	});
	await (
		await fetch('/__exact', {
			method: 'POST',
			headers,
			body: JSON.stringify({ type: 'invoke', id: 'save' })
		})
	).json();
	const recorded = recorder.exchanges[0];
	if (!Reflect.set(recorded.headers, 'x-owner', 'edited') || headers['x-owner'] !== 'original')
		throw new Error('Recorder headers are frozen or share transport storage');
	const observation = {
		operationId: 'save',
		componentId: 'application:save',
		token: 'status',
		scope: 'request'
	};
	recorder.observeServerContextAccess(observation);
	observation.token = 'original alias edit';
	const captured = recorder.serverContextAccesses()[0];
	if (
		captured.token !== 'status' ||
		!Reflect.set(captured, 'token', 'recorded alias edit') ||
		observation.token !== 'original alias edit'
	)
		throw new Error('Recorder context metadata is frozen or shares input storage');
	await recorder.settle();
	recorder.clear();
	if (recorder.exchanges.length) throw new Error('Recorder did not clear');
}

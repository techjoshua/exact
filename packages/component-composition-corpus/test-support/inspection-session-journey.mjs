/** Checks ordinary session observations, shared opening and private remote cleanup through the public inspector. */
export async function verifyInspectionSessionObservations({
	installExactDevtoolsRuntime,
	exactDevtoolsHookSymbol
}) {
	const previous = [exactDevtoolsHookSymbol].map((key) => [
		key,
		Object.getOwnPropertyDescriptor(globalThis, key)
	]);
	for (const [key] of previous) Reflect.deleteProperty(globalThis, key);
	let installation;
	try {
		for (const retire of ['disconnect', 'dispose']) {
			let opened = 0,
				replaced = 0;
			const closed = [];
			installation = installExactDevtoolsRuntime({
				endpoint: '/debug',
				fetch: async (_url, options) => {
					const body = JSON.parse(options.body);
					if (body.request === 'open')
						return Response.json({
							session: {
								id: `accepted-${++opened}`,
								protocol: 1,
								openedAt: 1,
								expiresAt: Date.now() + 60000,
								capabilities: ['snapshot']
							}
						});
					if (body.request === 'close') closed.push(body.sessionId);
					return Response.json(
						body.query
							? {
									protocol: 1,
									id: body.query.id,
									ok: true,
									identity: { sessionId: body.sessionId },
									result: []
								}
							: { ok: true }
					);
				}
			});
			const first = installation.hook.connect(),
				second = installation.hook.connect();
			const observation = await first;
			if (observation !== (await second) || opened !== 1)
				throw new Error('Concurrent opening lost shared result identity');
			observation.id = 'caller';
			observation.capabilities.push('source');
			const subscription = installation.hook.subscribe(
				{ protocol: 1, sessionId: 'accepted-1' },
				() => {}
			);
			subscription.close = () => {
				replaced++;
			};
			const next = await installation.hook.connect();
			if (
				next === observation ||
				next.id !== 'accepted-1' ||
				next.capabilities.join() !== 'snapshot'
			)
				throw new Error('Session observation changed private correlation');
			if (Object.isFrozen(installation) || Object.isFrozen(installation.hook))
				throw new Error('Inspector handle runtime readonly');
			if (retire === 'dispose')
				installation.hook.disconnect = async () => {
					replaced++;
				};
			if (retire === 'disconnect') {
				await installation.hook.disconnect();
				installation.hook.connect = async () => {
					replaced++;
					throw new Error('Public connect alias');
				};
				const result = await installation.hook.request({
					protocol: 1,
					id: 'reconnect',
					method: 'roots.list'
				});
				if (!result.ok || opened !== 2) throw new Error('Request did not own its reconnect');
			}
			await installation.dispose();
			installation = undefined;
			if (
				replaced ||
				closed.join() !== (retire === 'disconnect' ? 'accepted-1,accepted-2' : 'accepted-1')
			)
				throw new Error('Public method or session alias changed private cleanup');
		}
		installation = installExactDevtoolsRuntime({
			fetch: async () => {
				throw new Error('offline');
			}
		});
		const local = await installation.hook.connect();
		const id = local.id;
		local.id = 'caller';
		local.capabilities.length = 0;
		const next = await installation.hook.connect();
		if (next.id !== id || next.capabilities.join() !== 'snapshot,events')
			throw new Error('Local session observations changed retained state');
		return true;
	} finally {
		await installation?.dispose();
		for (const [key, descriptor] of previous) {
			Reflect.deleteProperty(globalThis, key);
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
		}
	}
}

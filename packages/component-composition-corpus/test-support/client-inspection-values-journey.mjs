/** Checks that page inspection exposes values already present in client state, props and contexts. */
export async function verifyClientInspectionValues(api) {
	const {
		installExactDevtoolsRuntime,
		exactDevtoolsHookSymbol,
		createFrameworkFixtureComponentInstance,
		createFrameworkComponentDomain,
		inspectExactRuntimeComponent,
		createContext
	} = api;
	const legacySymbol = Symbol.for('@exactjs/devtools-runtime');
	const previous = [legacySymbol, exactDevtoolsHookSymbol].map((key) => [
		key,
		Object.getOwnPropertyDescriptor(globalThis, key)
	]);
	for (const [key] of previous) Reflect.deleteProperty(globalThis, key);
	let instance, installation;
	try {
		const Secret = createContext('client-token', { keep: 'secret' });
		const Resource = createContext('client-resource', { keep: 'server' });
		installation = installExactDevtoolsRuntime({
			fetch: async () => {
				throw new Error('offline');
			}
		});
		function Account() {
			this.state.profile = { name: 'Ada', token: 'state-visible' };
			this.setContext(Secret, 'context-visible');
			this.setContext(Resource, { password: 'resource-visible' });
			return () => null;
		}
		instance = createFrameworkFixtureComponentInstance(
			Account,
			{ token: 'props-visible' },
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection: installation.inspection })
		);
		await installation.hook.connect();
		const verify = () => {
			const snapshot = JSON.stringify(inspectExactRuntimeComponent(instance));
			for (const value of ['state-visible', 'props-visible', 'context-visible', 'resource-visible'])
				if (!snapshot.includes(value))
					throw new Error('Client inspection hid an already-delivered value: ' + value);
		};
		verify();
		// Older instrumented artifacts may still carry selectors. They are inert client metadata.
		Reflect.set(globalThis, legacySymbol, {
			sources: [
				{
					protocol: 1,
					components: [],
					redactions: {
						statePaths: ['state.profile.token', 'props.token'],
						contextTokens: [],
						secretNames: ['password']
					}
				}
			]
		});
		verify();
		return true;
	} finally {
		instance?.unmount();
		await installation?.dispose();
		for (const [key, descriptor] of previous) {
			Reflect.deleteProperty(globalThis, key);
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
		}
	}
}

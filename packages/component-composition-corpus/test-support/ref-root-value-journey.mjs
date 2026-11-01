/** Keeps ref aliases ordinary while private release identity and rollback retain authority. */
export function verifyRefRootValues(api) {
	const serverOwner = {};
	const refs = api.directSsrRefs(serverOwner);
	const replacement = () => undefined;
	refs.get = replacement;
	check(
		api.directSsrRefs(serverOwner) === refs && refs.get === replacement,
		'stable writable SSR ref facade'
	);
	check(api.directSsrRefs({}).get !== replacement, 'SSR owner isolation');
	const serverRoot = api.directSsrRoot(serverOwner);
	serverRoot.generation = 7;
	check(
		api.directSsrRoot(serverOwner).generation === 7 && api.directSsrRoot({}).generation === 0,
		'ordinary owner-local SSR observation'
	);
	const nativeBinding = api.directSsrRef(serverOwner, {
		id: Symbol('owner'),
		description: 'owner'
	});
	nativeBinding.owner = {};
	let rejected = false;
	try {
		api.directSsrRoot(nativeBinding.owner, nativeBinding);
	} catch (error) {
		rejected = /owned/.test(String(error?.message));
	}
	check(
		rejected && api.directSsrRoot(serverOwner, nativeBinding) === nativeBinding,
		'SSR ref original owner'
	);
	const instance = api.createFrameworkFixtureComponentInstance(() => () => null, {});
	try {
		const target = {};
		api.publishComponentRoot(instance, target, true, 'initial');
		const lifecycle = instance.refs.root();
		const registry = instance.refs;
		const originalGet = registry.get;
		registry.get = replacement;
		check(registry.get === replacement, 'ordinary client ref methods');
		registry.get = originalGet;
		const key = { id: Symbol('client-owner'), description: 'client-owner' };
		const binding = instance.ref(key);
		const foreign = api.createFrameworkFixtureComponentInstance(() => () => null, {});
		try {
			binding.owner = foreign;
			let rejected = false;
			try {
				foreign.refs.root(binding);
			} catch (error) {
				rejected = /owned/.test(String(error?.message));
			}
			check(rejected && instance.refs.root(binding) === binding, 'client ref original owner');
		} finally {
			foreign.unmount();
		}
		api.publishComponentRootRelease(instance, 'reconcile-removed');
		lifecycle.release.generation = 999;
		lifecycle.release.target = {};
		lifecycle.release.presented = false;
		check(!api.reverseComponentRootRelease(instance, 999), 'reject forged observation generation');
		check(
			api.reverseComponentRootRelease(instance, 1) &&
				lifecycle.current === target &&
				lifecycle.presented,
			'original private identity reversal'
		);
		api.publishComponentRootRelease(instance, 'reconcile-removed');
		let aborted = false;
		try {
			api.batch(() => {
				check(api.reverseComponentRootRelease(instance, 1), 'transaction reversal');
				throw new Error('abort');
			});
		} catch (error) {
			aborted = error?.message === 'abort';
		}
		check(
			aborted &&
				lifecycle.current === undefined &&
				lifecycle.release &&
				api.reverseComponentRootRelease(instance, 1),
			'authority rollback'
		);
		check(lifecycle.current === target && lifecycle.release === undefined, 'restored observation');
	} finally {
		api.disposeComponentRoot(instance);
		instance.unmount();
	}
	return true;
}
function check(condition, contract) {
	if (!condition) throw new Error(`Ref/root value contract failed: ${contract}`);
}

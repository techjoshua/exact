/** Checks the original container-carried capture through public mount, state updates and unmount. */
export async function verifySharedComposition({
	SharedComposition,
	testComponent,
	createErrorContext,
	ErrorContext
}) {
	const check = (condition, message) => {
		if (!condition) throw new Error('Shared composition: ' + message);
	};
	const calls = { affected: 0, unrelated: 0, mounted: 0, disposed: 0 };
	const errors = createErrorContext();
	const view = await testComponent(SharedComposition)
		.props({
			observe(lane, value) {
				calls[lane]++;
				return value;
			},
			mounted() {
				calls.mounted++;
			},
			disposed() {
				calls.disposed++;
			}
		})
		.context(ErrorContext, errors)
		.mount();
	const instance = view.root.instance;
	const state = view.root.state();
	const affected = view.container.querySelector('[data-lane="affected"]');
	const unrelated = view.container.querySelector('[data-lane="unrelated"]');
	try {
		check(affected?.textContent === '1', 'initial affected output');
		check(unrelated?.textContent === '10', 'initial unrelated output');
		const affectedCalls = calls.affected;
		const unrelatedCalls = calls.unrelated;
		for (const count of [2, 3]) {
			await view.root.setState({ count });
			check(affected.textContent === String(count), 'affected output after update ' + count);
			check(
				view.container.querySelector('[data-lane="affected"]') === affected,
				'affected DOM identity'
			);
			check(
				view.container.querySelector('[data-lane="unrelated"]') === unrelated,
				'unrelated DOM identity'
			);
			check(view.root.instance === instance, 'component identity');
			check(view.root.state() === state, 'state identity');
			check(calls.unrelated === unrelatedCalls, 'unrelated consumer replay');
		}
		check(calls.affected > affectedCalls, 'affected consumer update');
		check(calls.mounted === 1, 'one mount');
		check(calls.disposed === 0, 'no early disposal');
		check(errors.errors.length === 0, 'no framework errors before disposal');
	} finally {
		await view.unmount();
	}
	check(calls.disposed === 1, 'one disposal');
	check(instance.scope.active === false, 'inactive disposed scope');
	check(view.container.childNodes.length === 0, 'empty disposed container');
	check(errors.errors.length === 0, 'no framework errors after disposal');
	return {
		updates: [2, 3],
		sameInstance: true,
		sameState: true,
		sameDOM: true,
		unrelatedReplay: false,
		mounts: calls.mounted,
		disposals: calls.disposed,
		frameworkErrors: 0
	};
}

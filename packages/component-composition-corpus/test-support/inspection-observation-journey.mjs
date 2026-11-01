/** Checks ordinary previews and metadata without exposing private traversal or dispatch authority. */
export function verifyInspectionPreviewOwnership({
	previewExactValue,
	redactExactValue,
	paginateExactInspection,
	EXACT_INSPECTION_METHODS,
	parseExactInspectionRequest
}) {
	const source = { count: 1 };
	const preview = previewExactValue(source);
	preview.entries[0].value.value = 2;
	preview.entries.length = 0;
	if (source.count !== 1 || previewExactValue(source).entries[0].value.value !== 1)
		throw new Error('Inspection preview ownership');
	const marker = redactExactValue('secret');
	marker.reason = 'observation';
	if (redactExactValue('secret').reason !== 'secret')
		throw new Error('Inspection redaction observation');
	const protectedValue = previewExactValue(
		{ settings: { token: 'must-never-escape' } },
		{
			redact(path) {
				const qualified = path.join('.');
				if (qualified === 'settings') path.length = 0;
				return qualified === 'settings.token' ? 'secret' : undefined;
			}
		}
	);
	if (JSON.stringify(protectedValue).includes('must-never-escape'))
		throw new Error('Inspection private traversal path');
	for (const invalid of [null, false, '', 'unknown-policy', {}, 0]) {
		const rejected = previewExactValue('must-never-escape', { redact: () => invalid });
		if (rejected.kind !== 'unavailable' || rejected.reason !== 'redaction-failed')
			throw new Error('Inspection malformed redaction decision');
	}
	for (const invalid of [null, false, 0, '', {}]) {
		const rejected = previewExactValue('private-value', { redact: invalid });
		if (rejected.kind !== 'unavailable' || rejected.reason !== 'redaction-failed')
			throw new Error('Malformed configured inspection redactor');
	}
	const values = [{ count: 1 }, { count: 2 }];
	const page = paginateExactInspection(values, { limit: 1 });
	if (page.values[0] !== values[0]) throw new Error('Inspection shallow page item identity');
	page.values.length = 0;
	page.nextCursor = 'observation';
	if (values.length !== 2) throw new Error('Inspection page array ownership');
	const first = EXACT_INSPECTION_METHODS[0];
	try {
		EXACT_INSPECTION_METHODS[0] = 'actions.invoke';
		let rejected = false;
		try {
			parseExactInspectionRequest({ protocol: 1, id: 'query', method: 'actions.invoke' });
		} catch {
			rejected = true;
		}
		if (
			!rejected ||
			parseExactInspectionRequest({ protocol: 1, id: 'query', method: first }).method !== first
		)
			throw new Error('Inspection private dispatch authority');
	} finally {
		EXACT_INSPECTION_METHODS[0] = first;
	}
	return true;
}

/** Checks detached component/task snapshots and side-effect-free component display names. */
export async function verifyInspectionObservationOwnership({
	createExactRuntimeInspectionOwner,
	createFrameworkComponentDomain,
	createFrameworkFixtureComponentInstance,
	defineTask,
	inspectExactRuntimeComponent
}) {
	const inspection = createExactRuntimeInspectionOwner({
		buildKey: 'build',
		executionRoot: 'page'
	});
	let instance, execution;
	function Calculator() {
		this.state.count = 2;
		const calculate = defineTask({ label: 'Collect' }, async (value) => ({ total: value * 2 }));
		execution = calculate(2);
		return () => null;
	}
	inspection.attach('session', { publish() {} });
	try {
		instance = createFrameworkFixtureComponentInstance(
			Calculator,
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection })
		);
		await execution;
		const observation = inspectExactRuntimeComponent(instance);
		const task = observation.tasks.find((task) => task.name === 'Collect');
		if (!task?.result) throw new Error('Inspection settled task control');
		const expected = JSON.stringify(task.result);
		observation.name = 'Changed';
		task.name = 'Changed';
		task.result.entries.length = 0;
		observation.tasks.length = 0;
		const next = inspectExactRuntimeComponent(instance);
		if (
			next.name !== 'Calculator' ||
			JSON.stringify(next.tasks.find((task) => task.name === 'Collect')?.result) !== expected ||
			instance.state.count !== 2
		)
			throw new Error('Inspection retained task snapshot ownership');
		let reads = 0;
		Object.defineProperty(Calculator, 'name', {
			configurable: true,
			get() {
				reads++;
				return { privateState: 'must not escape' };
			}
		});
		const named = inspectExactRuntimeComponent(instance);
		if (reads !== 0 || named.name !== 'Anonymous')
			throw new Error('Inspection component metadata accessor');
		let calls = 0;
		inspection.publish = () => calls++;
		inspection.publish({ kind: 'state.change', component: instance });
		if (calls !== 1) throw new Error('Inspection ordinary method handle');
		return true;
	} finally {
		instance?.unmount();
		inspection.detach();
	}
}

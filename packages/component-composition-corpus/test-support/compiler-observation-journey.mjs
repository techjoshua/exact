/** Owned source exercises inferred tasks, reactive dependencies, and event activation metadata. */
export const compilerObservationSource = `import { TaskContext, type Component } from '@exactjs/core';
export async function Observation(this: Component<{ count: number; label?: string }>) {
 this.state.count = 1;
 this.state.label = await Promise.resolve('ready');
 return () => <main><button onClick={() => this.state.count++}>{this.state.count * 2} {this.state.label}</button></main>;
}`;

/** Exercises writable aliases across data-only observation records without changing their topology. */
function editObservation(value) {
	const pending = [value];
	const seen = new Set();
	while (pending.length) {
		const current = pending.pop();
		if (!current || typeof current !== 'object' || seen.has(current)) continue;
		seen.add(current);
		const keys = Object.keys(current);
		if (!Reflect.set(current, 'observationEdited', true))
			throw new Error('Compiler observation rejects an ordinary alias');
		for (const key of keys) {
			const child = current[key];
			if (child && typeof child === 'object') pending.push(child);
			else if (typeof child === 'string') current[key] = 'edited:' + child;
			else if (typeof child === 'number') current[key] = child + 1;
			else if (typeof child === 'boolean') current[key] = !child;
		}
	}
}

/** Checks public editor observations against retained native analysis and generation fences. */
export async function verifyCompilerServiceValues(
	{
		createExactLanguageService,
		createExactBuildInspectionCatalog,
		createExactRuntimeInspectionCorrelation
	},
	root
) {
	const service = createExactLanguageService({ root, noEmit: true });
	const filename = '.tmp/framework-confidence/CompilerObservation.tsx';
	try {
		const update = await service.synchronize([
			{ kind: 'upsert', filename, version: 1, source: compilerObservationSource }
		]);
		const inspection = await service.inspect(filename);
		const expected = JSON.stringify(inspection);
		const generation = update.generation;
		const catalog = createExactBuildInspectionCatalog({
			buildKey: 'observations',
			root,
			roots: [
				{
					executionRoot: 'page',
					rootComponentId: inspection.components[0].id,
					inspections: [inspection],
					sources: { [inspection.filename]: compilerObservationSource }
				}
			]
		});
		const correlation = createExactRuntimeInspectionCorrelation(inspection);
		for (const value of [update, service.stats(), inspection, catalog, correlation])
			editObservation(value);
		if (
			JSON.stringify(await service.inspect(filename)) !== expected ||
			service.stats().generation !== generation
		)
			throw new Error('Compiler observation edits changed retained native facts');
		const next = await service.synchronize([
			{
				kind: 'upsert',
				filename,
				version: 2,
				source: compilerObservationSource.replace('count = 1', 'count = 2')
			}
		]);
		if (next.generation !== generation + 1)
			throw new Error('Compiler observation edits changed generation ownership');
	} finally {
		await service.dispose();
	}
}

/** Checks independent projections of the same real native response without launching a compiler process. */
export function verifyCompilerProjectionValues(
	{
		createExactSourceInspection,
		nativeModuleAnalysis,
		createArtifactBuildProducts,
		createExactCompilerExplanation,
		createExactRuntimeInspectionCorrelation,
		planExactTaskRefactor
	},
	fixture
) {
	const response = structuredClone(fixture.response);
	const baseline = JSON.stringify(response);
	const analysis = nativeModuleAnalysis(fixture.filename, response);
	const analysisBaseline = JSON.stringify(analysis);
	const inspection = createExactSourceInspection(fixture.filename, fixture.source, 1, response);
	const products = createArtifactBuildProducts(fixture.filename, analysis);
	const explanation = createExactCompilerExplanation(analysis, 'client');
	const correlation = createExactRuntimeInspectionCorrelation(inspection);
	const tasks = [];
	const pending = [...inspection.components];
	while (pending.length) {
		const entity = pending.pop();
		if (entity.kind === 'inferred-task') tasks.push(entity);
		for (const child of entity.children) pending.push(child);
	}
	const task = tasks.find(
		(entity) =>
			entity.classification?.kind === 'task' &&
			fixture.source.slice(entity.range.start, entity.range.end).includes('await ')
	);
	if (!task) throw new Error('Compiler observation fixture has no inferred task');
	const request = {
		filename: fixture.filename,
		generation: 1,
		kind: 'convert-to-explicit-task',
		range: task.range
	};
	const plan = planExactTaskRefactor(request, fixture.source, inspection);
	if (!plan) throw new Error('Compiler observation fixture has no supported refactor');
	const expectedSemantics = JSON.stringify(plan.expected.preserved);
	editObservation(plan);
	if (
		JSON.stringify(
			planExactTaskRefactor(request, fixture.source, inspection)?.expected.preserved
		) !== expectedSemantics
	)
		throw new Error('Compiler refactor observation edits changed shared semantic descriptions');
	for (const value of [inspection, products, explanation, correlation]) editObservation(value);
	if (JSON.stringify(response) !== baseline || JSON.stringify(analysis) !== analysisBaseline)
		throw new Error('Compiler projection edits changed private native or normalized facts');
}

/** Keeps session observations writable without sharing a mutable empty result between callers. */
export function verifyCompilerSessionValues({ createCompilerSession }) {
	const session = createCompilerSession();
	try {
		const expected = JSON.stringify(session.stats());
		const ignored = session.invalidate('observation.png');
		for (const value of [session.stats(), ignored, session.invalidate('removed.ts', true)])
			editObservation(value);
		if (JSON.stringify(session.stats()) !== expected)
			throw new Error('Editing statistics changed the next session observation');
		if (JSON.stringify(session.invalidate('next.png')) !== '{"affectedFiles":[],"diagnostics":[]}')
			throw new Error('Ignored invalidations share caller-editable observations');
	} finally {
		session.dispose();
	}
	try {
		session.stats();
	} catch {
		return;
	}
	throw new Error('Disposed compiler session remained usable');
}

/** Checks build reports and decoded facade records without weakening validation or changing inputs. */
export function verifyCompilerBuildValues({
	createExactPublishedComponentBuildFacts,
	inspectExactClientArtifactIsolation,
	exactEnhancementFacadeRequest,
	parseExactEnhancementFacadeRequest
}) {
	const input = {
		package: { name: '@owned/observation', version: '1.0.0' },
		modules: [],
		exports: []
	};
	const expected = JSON.stringify(input);
	const request = exactEnhancementFacadeRequest({
		identity: 'owned-observation',
		moduleSpecifier: '@owned/widget',
		exportName: 'Widget'
	});
	const parsed = parseExactEnhancementFacadeRequest(request);
	const expectedFacade = JSON.stringify(parsed);
	const outputs = [{ fileName: 'page.exact.server.js', type: 'chunk' }];
	const report = inspectExactClientArtifactIsolation(outputs);
	if (report.ok || !report.violations.length)
		throw new Error('Server artifact escaped isolation validation');
	for (const value of [createExactPublishedComponentBuildFacts(input), parsed, report])
		editObservation(value);
	if (JSON.stringify(input) !== expected)
		throw new Error('Editing build observations changed authored inputs');
	if (JSON.stringify(parseExactEnhancementFacadeRequest(request)) !== expectedFacade)
		throw new Error('Editing a facade changed later decoding');
	if (
		inspectExactClientArtifactIsolation(outputs).ok ||
		!inspectExactClientArtifactIsolation([{ fileName: 'page.client.js', type: 'chunk' }]).ok
	)
		throw new Error('Editing isolation observations changed validation');
}

import { createInspectionCatalogFixture } from '../inspection-catalog-fixture.ts';
import { verifyInspectionCatalogData } from '../inspection-catalog-data-journey.ts';
import {
	isExactBuildInspectionCatalog,
	isExactInspectionRuntimeId
} from '@exactjs/devtools-protocol';
import { createExactServerDebugRuntime } from '@exactjs/server';

/** Checks deep source traversal, cycle rejection and complete catalog arrays in native hosts. */
export async function inspectionCatalogJourney() {
	verifyInspectionCatalogData({ isExactBuildInspectionCatalog, isExactInspectionRuntimeId });
	const create = createInspectionCatalogFixture;
	const location = create().roots.page.files[0].components[0].location;
	const results = [];
	const deep = create();
	const root = deep.roots.page.files[0].components[0];
	let cursor = root;
	for (let index = 0; index < 20_000; index++) {
		const child = { ...root, id: 'child:' + index, children: [] };
		cursor.children = [child];
		cursor = child;
	}
	results.push(isExactBuildInspectionCatalog(deep));
	const runtime = createExactServerDebugRuntime({
		allowDebug: true,
		publicOrigin: 'https://app.test',
		inspectionCatalogs: [deep]
	});
	const request = {
		method: 'POST',
		url: 'https://app.test/__exact',
		headers: { origin: 'https://app.test' }
	};
	try {
		const opened = await runtime.handle(request, {
			type: 'debug',
			version: 1,
			request: 'open',
			capabilities: ['catalog']
		});
		const sessionId = JSON.parse(opened.body).session.id;
		const query = async (sourceEntityId) => {
			const response = await runtime.handle(request, {
				type: 'debug',
				version: 1,
				request: 'query',
				sessionId,
				query: {
					protocol: 1,
					id: 'deep-entity',
					method: 'catalog.entity',
					params: {
						identity: {
							sessionId,
							side: 'server',
							buildKey: 'build',
							executionRoot: 'page',
							componentTypeId: 'root'
						},
						sourceEntityId
					}
				}
			});
			return JSON.parse(response.body);
		};
		const leaf = await query('child:19999');
		results.push(leaf.ok && leaf.result.id === 'child:19999');
		const missing = await query('absent');
		results.push(!missing.ok && missing.error === 'not-found');
		const whole = await query('root');
		results.push(!whole.ok && whole.error === 'limit-exceeded');
	} finally {
		await runtime.close();
	}

	cursor.children = [root];
	results.push(!isExactBuildInspectionCatalog(deep));
	for (const field of [
		'files',
		'components',
		'children',
		'reasons',
		'statePaths',
		'secretNames',
		'contextTokens',
		'classification'
	]) {
		const value = create();
		const page = value.roots.page;
		const entity = page.files[0].components[0];
		const arrays = {
			files: page.files,
			components: page.files[0].components,
			children: entity.children,
			reasons: entity.reasons,
			statePaths: page.redactions.statePaths,
			secretNames: page.redactions.secretNames,
			contextTokens: page.redactions.contextTokens,
			classification: []
		};
		if (field === 'classification') entity.classification = { labels: arrays.classification };
		results.push(isExactBuildInspectionCatalog(value));
		arrays[field].length++;
		results.push(!isExactBuildInspectionCatalog(value));
	}
	return results;
}

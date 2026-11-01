/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
import { describe, expect, it } from 'vitest';
import { createInspectionCatalogFixture } from '../../component-composition-corpus/test-support/inspection-catalog-fixture.js';
import { isExactBuildInspectionCatalog } from './identity.js';

function catalog(): any {
	const value = createInspectionCatalogFixture('component:Page');
	value.roots.page.redactions.statePaths.push('state.token');
	value.roots.page.redactions.secretNames.push('TOKEN');
	return value;
}

describe('build inspection catalog validation', () => {
	it('enforces the shared entity budget across source records', () => {
		const value = catalog();
		const file = value.roots.page.files[0];
		const first = file.components[0];
		file.components = Array.from({ length: 100_000 }, (_, index) => ({
			...first,
			id: index === 0 ? first.id : 'entity:' + index
		}));
		expect(isExactBuildInspectionCatalog(value)).toBe(true);
		file.components.push({ ...first, id: 'over-budget' });
		expect(isExactBuildInspectionCatalog(value)).toBe(false);
	});
	it.each([
		'partitionPlans',
		'partitionRoots',
		'partitionNodes',
		'partitionEdges',
		'packages',
		'packageReasons',
		'provenance',
		'omittedEnhancements'
	])('checks complete %s against a valid catalog control', (field) => {
		const value = catalog();
		value.roots.page.partitionPlans = [
			{ version: 1, buildKey: 'build', roots: ['root'], nodes: [{ id: 'root' }], edges: [] }
		];
		value.componentAuthorization = {
			protocol: 1,
			buildKey: 'build',
			fingerprint: 'fingerprint',
			packages: [
				{
					instanceId: 'instance',
					name: '@acme/cards',
					version: '1.0.0',
					markerVersion: '0.1.0',
					decision: 'root',
					reasons: ['ssr'],
					provenance: [{ owner: 'application', specifier: '@acme/cards', kind: 'dependency' }]
				}
			],
			omittedEnhancements: []
		};
		const plan = value.roots.page.partitionPlans[0];
		const authorization = value.componentAuthorization;
		const arrays: Record<string, unknown[]> = {
			partitionPlans: value.roots.page.partitionPlans,
			partitionRoots: plan.roots,
			partitionNodes: plan.nodes,
			partitionEdges: plan.edges,
			packages: authorization.packages,
			packageReasons: authorization.packages[0].reasons,
			provenance: authorization.packages[0].provenance,
			omittedEnhancements: authorization.omittedEnhancements
		};
		expect(isExactBuildInspectionCatalog(value)).toBe(true);
		arrays[field]!.length++;
		expect(isExactBuildInspectionCatalog(value)).toBe(false);
	});
	it('rejects absent source entities in sparse child arrays', () => {
		const value = catalog();
		value.roots.page.files[0].components[0].children = new Array(1);
		expect(isExactBuildInspectionCatalog(value)).toBe(false);
	});
	it.each([
		'files',
		'components',
		'reasons',
		'statePaths',
		'secretNames',
		'contextTokens',
		'classification'
	])('rejects absent catalog entries in %s', (field) => {
		const value = catalog();
		const root = value.roots.page;
		const entity = root.files[0].components[0];
		const arrays: Record<string, unknown[]> = {
			files: root.files,
			components: root.files[0].components,
			reasons: entity.reasons,
			statePaths: root.redactions.statePaths,
			secretNames: root.redactions.secretNames,
			contextTokens: root.redactions.contextTokens,
			classification: []
		};
		if (field === 'classification') entity.classification = { labels: arrays.classification };
		arrays[field]!.length++;
		expect(isExactBuildInspectionCatalog(value)).toBe(false);
	});
	it('validates deep source trees without exhausting the JavaScript call stack', () => {
		const value = catalog();
		let entity = value.roots.page.files[0].components[0];
		for (let index = 0; index < 20_000; index++) {
			const child = { ...entity, id: 'child:' + index, children: [] };
			entity.children = [child];
			entity = child;
		}
		expect(isExactBuildInspectionCatalog(value)).toBe(true);
		entity.children = [value.roots.page.files[0].components[0]];
		expect(isExactBuildInspectionCatalog(value)).toBe(false);
	});
	it('validates nested identities, locations, hashes, and relative paths', () => {
		expect(isExactBuildInspectionCatalog(catalog())).toBe(true);
		const absolute = catalog();
		absolute.roots.page.files[0].path = 'C:\\private\\Page.tsx';
		expect(isExactBuildInspectionCatalog(absolute)).toBe(false);
		const duplicate = catalog();
		duplicate.roots.page.files[0].components.push(duplicate.roots.page.files[0].components[0]);
		expect(isExactBuildInspectionCatalog(duplicate)).toBe(false);
	});

	it('rejects any value-bearing field in server catalog policy or classifications', () => {
		const policyValue = catalog();
		policyValue.roots.page.redactions.contextTokens.push({
			name: 'secret',
			scope: 'request',
			kind: 'secret',
			value: 'must-never-enter-a-catalog'
		});
		expect(isExactBuildInspectionCatalog(policyValue)).toBe(false);

		const classificationValue = catalog();
		classificationValue.roots.page.files[0].components[0].classification = {
			kind: 'task',
			value: 'must-never-enter-a-catalog'
		};
		expect(isExactBuildInspectionCatalog(classificationValue)).toBe(false);
	});

	it('validates a redacted component authorization projection against the catalog build', () => {
		const value = catalog();
		value.componentAuthorization = {
			protocol: 1,
			buildKey: 'build',
			fingerprint: 'fingerprint',
			packages: [
				{
					instanceId: 'instance',
					name: '@acme/cards',
					version: '1.0.0',
					markerVersion: '0.1.0',
					decision: 'root',
					reasons: ['ssr'],
					provenance: [{ owner: 'application', specifier: '@acme/cards', kind: 'dependency' }]
				}
			],
			omittedEnhancements: []
		};
		expect(isExactBuildInspectionCatalog(value)).toBe(true);
		value.componentAuthorization.buildKey = 'other-build';
		expect(isExactBuildInspectionCatalog(value)).toBe(false);
	});
});

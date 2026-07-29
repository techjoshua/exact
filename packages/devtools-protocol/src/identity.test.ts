import { describe, expect, it } from 'vitest';
import { isExactBuildInspectionCatalog } from './identity.js';

function catalog(): any {
	const location = {
		path: 'src/Page.tsx',
		sourceHash: 'a'.repeat(64),
		start: { offset: 0, line: 1, column: 1 },
		end: { offset: 10, line: 1, column: 11 }
	};
	return {
		protocol: 1,
		buildKey: 'build',
		producer: {},
		roots: {
			page: {
				executionRoot: 'page',
				rootComponentId: 'component:Page',
				files: [
					{
						path: 'src/Page.tsx',
						sourceHash: 'a'.repeat(64),
						components: [
							{
								id: 'component:Page',
								kind: 'component',
								location,
								reasons: [],
								children: []
							}
						]
					}
				],
				redactions: {
					statePaths: ['state.token'],
					contextTokens: [],
					secretNames: ['TOKEN']
				}
			}
		}
	};
}

describe('build inspection catalog validation', () => {
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
});

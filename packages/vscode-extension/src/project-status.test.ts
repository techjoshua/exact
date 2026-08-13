import { describe, expect, it } from 'vitest';
import { projectStatusPresentation } from './project-status.js';

describe('projectStatusPresentation', () => {
	it('shows the active project root and ready intl provider', () => {
		const presentation = projectStatusPresentation({
			trusted: true,
			project: { kind: 'configured', root: '/workspace/apps/example' },
			compiler: { typescriptVersion: '7.0.0', backendVersion: '1.0.0' },
			providers: [
				{
					id: '@exactjs/intl',
					version: '0.1.0',
					trust: 'root',
					capabilities: ['diagnostics'],
					packageRoot: '/workspace/packages/intl',
					manifestPath: '/workspace/packages/intl/package.json',
					ignoredRoles: [],
					health: 'ready',
					generation: 1
				}
			]
		});

		expect(presentation.text).toContain('eXact configured');
		expect(presentation.tooltip).toContain('Project root: /workspace/apps/example');
		expect(presentation.tooltip).toContain('✓ @exactjs/intl ready');
	});

	it('makes provider failures visible', () => {
		const presentation = projectStatusPresentation({
			trusted: true,
			providerFailure: 'Unable to load analyzer'
		});

		expect(presentation.text).toContain('$(warning)');
		expect(presentation.tooltip).toContain('Provider host failure: Unable to load analyzer');
	});
});

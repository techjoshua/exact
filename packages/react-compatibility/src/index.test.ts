import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	capabilityFor,
	compareConformanceTraces,
	reactCapabilities,
	rendererCompatibilityCapabilities,
	type ConformanceTrace
} from './index.js';

describe('React compatibility contract', () => {
	it('has unique module/name/baseline records with actionable dispositions', () => {
		const identities = new Set<string>();
		for (const capability of reactCapabilities) {
			expect(capability.baselines.length).toBeGreaterThan(0);
			if (capability.status === 'unsupported') expect(capability.phase).toBeNull();
			else expect(capability.phase).toBeTypeOf('number');
			for (const baseline of capability.baselines) {
				const identity = `${capability.module}:${capability.name}:${baseline}`;
				expect(identities.has(identity), identity).toBe(false);
				identities.add(identity);
			}
		}
	});

	it('keeps baseline-specific APIs explicit', () => {
		expect(capabilityFor('react', 'useState', '18.3')?.phase).toBe(1);
		expect(capabilityFor('react', 'useActionState', '18.3')).toBeUndefined();
		expect(capabilityFor('react', 'useActionState', '19.2')?.phase).toBe(3);
		expect(capabilityFor('react-dom', 'findDOMNode', '18.3')?.status).toBe('supported');
	});

	it('publishes renderer capabilities and 100 machine-readable package/version results', () => {
		expect(
			rendererCompatibilityCapabilities.find((item) => item.name === 'generic-react-reconciler')
				?.status
		).toBe('supported');
		const corpus = JSON.parse(
			readFileSync(new URL('../ordinary-package-corpus.json', import.meta.url), 'utf8')
		) as {
			minimumPackages: number;
			resultFields: string[];
			resultProfiles: Record<string, Record<string, string>>;
			packages: Array<{ package: string; version: string; resultProfile: string }>;
		};
		expect(corpus.minimumPackages).toBe(100);
		expect(corpus.packages.length).toBeGreaterThanOrEqual(corpus.minimumPackages);
		expect(new Set(corpus.packages.map((item) => `${item.package}@${item.version}`)).size).toBe(
			corpus.packages.length
		);
		for (const item of corpus.packages) {
			const results = corpus.resultProfiles[item.resultProfile];
			expect(results, `${item.package}@${item.version}`).toBeDefined();
			expect(Object.keys(results).sort()).toEqual([...corpus.resultFields].sort());
		}
	});

	it('reports structural trace differences and ignores baseline metadata', () => {
		const trace = (
			baseline: '18.3' | '19.2',
			updatedHtml = '<button>1</button>'
		): ConformanceTrace => ({
			baseline,
			version: baseline,
			exports: {},
			element: { type: 'div', key: 'item', children: ['A', 'B'] },
			serverHtml: '<p>server</p>',
			client: {
				initialHtml: '<button>0</button>',
				updatedHtml,
				renders: 2,
				events: ['layout:0', 'effect:0']
			}
		});
		expect(compareConformanceTraces(trace('18.3'), trace('19.2'))).toEqual([]);
		expect(compareConformanceTraces(trace('18.3'), trace('19.2', '<button>2</button>'))).toEqual([
			{ path: 'client.updatedHtml', expected: '<button>1</button>', actual: '<button>2</button>' }
		]);
	});
});

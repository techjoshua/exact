import { describe, expect, it, vi } from 'vitest';
import { createExactViteMicrofrontendIntegration } from './microfrontends.js';

const registry = (enabled = true) =>
	({
		applicationRoot: '/application',
		compiler: {
			plugins: enabled ? { '@exactjs/microfrontends': { cacheKey: { enabled: true } } } : {}
		}
	}) as any;

function rollupHarness(hasRemoteBindings = true, pageBootstrapImport = '/provided.js') {
	const adapter = {
		pageBootstrapImport,
		developmentEntries: { './Area': '/area.js' },
		buildStart: vi.fn(),
		recordModule: vi.fn(),
		resolveId: vi.fn(async (): Promise<{ id: string } | null> => null),
		load: vi.fn(() => null),
		generateBundle: vi.fn()
	};
	const module = {
		readExactMicrofrontendCompilerConfig: vi.fn(() => ({ exposes: {} })),
		prepareExactRemoteArtifactBuild: vi.fn(async () => ({
			plan: { exposures: [] },
			hasRemoteBindings
		})),
		createExactRemoteRollupAdapter: vi.fn(() => adapter)
	};
	return { adapter, module, load: vi.fn(async () => module as any) };
}

describe('Vite microfrontend integration', () => {
	it('stays inert for server builds and projects without the plugin', async () => {
		const harness = rollupHarness();
		const server = createExactViteMicrofrontendIntegration({ target: 'server' }, harness.load);
		await server.buildStart(registry(), vi.fn());

		const absent = createExactViteMicrofrontendIntegration({}, harness.load);
		await absent.buildStart(registry(false), vi.fn());

		expect(harness.load).not.toHaveBeenCalled();
		expect(absent.resolveId('source', undefined, () => 'framework')).toBe('framework');
	});

	it('rejects an active remote build when Rollup cannot emit its entry', async () => {
		const harness = rollupHarness();
		const integration = createExactViteMicrofrontendIntegration({}, harness.load);

		await expect(integration.buildStart(registry(), undefined)).rejects.toThrow(
			'emitFile is unavailable'
		);
		expect(harness.adapter.buildStart).not.toHaveBeenCalled();
	});

	it('prepares development entries without emitting Rollup chunks in serve mode', async () => {
		const harness = rollupHarness(true, 'virtual:exact-provided-packages');
		const onDevelopmentEntries = vi.fn();
		const integration = createExactViteMicrofrontendIntegration(
			{ onRemoteDevelopmentEntries: onDevelopmentEntries },
			harness.load
		);

		await integration.buildStart(registry(), undefined, 'serve');

		expect(onDevelopmentEntries).toHaveBeenCalledWith({ './Area': '/area.js' });
		expect(harness.adapter.buildStart).not.toHaveBeenCalled();
		expect(await integration.resolveId('source', undefined, () => 'framework')).toBe('framework');
		expect(integration.transformIndexHtml('<body></body>')).toBe(
			'<body><script type="module" src="/@id/virtual:exact-provided-packages"></script></body>'
		);
	});

	it('delegates the adapter lifecycle and preserves framework resolution fallback', async () => {
		const harness = rollupHarness();
		const onDevelopmentEntries = vi.fn();
		const integration = createExactViteMicrofrontendIntegration(
			{ onRemoteDevelopmentEntries: onDevelopmentEntries },
			harness.load
		);
		const emitFile = vi.fn(() => 'entry-reference');
		await integration.buildStart(registry(), emitFile);

		expect(harness.adapter.buildStart).toHaveBeenCalledWith({ emitFile });
		expect(onDevelopmentEntries).toHaveBeenCalledWith({ './Area': '/area.js' });
		expect(await integration.resolveId('source', undefined, () => 'framework')).toBe('framework');
		harness.adapter.resolveId.mockResolvedValueOnce({ id: 'remote' });
		expect(await integration.resolveId('source', undefined, () => 'framework')).toEqual({
			id: 'remote'
		});
		integration.recordModule('code', '/module.ts');
		integration.generateBundle({});
		expect(harness.adapter.recordModule).toHaveBeenCalledWith('code', '/module.ts');
		expect(harness.adapter.generateBundle).toHaveBeenCalledWith({});
	});

	it('publishes provided packages before page modules with safe HTML fallbacks', async () => {
		const harness = rollupHarness();
		const integration = createExactViteMicrofrontendIntegration({}, harness.load);
		await integration.buildStart(registry(), vi.fn());
		const bootstrap = '<script type="module" src="/provided.js"></script>';

		expect(integration.transformIndexHtml('<script type="module" src="/page.js"></script>')).toBe(
			`${bootstrap}<script type="module" src="/page.js"></script>`
		);
		expect(integration.transformIndexHtml('<body><main></main></body>')).toBe(
			`<body><main></main>${bootstrap}</body>`
		);
		expect(integration.transformIndexHtml('<main></main>')).toBe(`<main></main>${bootstrap}`);
	});

	it('does not publish provided packages when the page has no remote bindings', async () => {
		const harness = rollupHarness(false);
		const integration = createExactViteMicrofrontendIntegration({}, harness.load);
		await integration.buildStart(registry(), vi.fn());

		expect(integration.transformIndexHtml('<body></body>')).toBe('<body></body>');
	});
});

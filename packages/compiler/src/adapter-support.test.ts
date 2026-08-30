import { describe, expect, it } from 'vitest';
import {
	createExactDiagnosticReporter,
	exactComponentContractProjection,
	exactEnhancementFacadeImports,
	exactEnhancementFacadeRequest,
	exactAvailableEnhancementFacadeSource,
	exactUnavailableEnhancementFacadeSource,
	parseExactEnhancementFacadeRequest,
	exactDiagnosticKey,
	formatExactDiagnostic,
	isExactGeneratedArtifactModule,
	shouldCompileExactBuildModule,
	shouldTransformExactBuildModulePath,
	matchesExactBuildFilter,
	prependExactEnhancementRegistrations,
	transformExactAdapterModule
} from './adapter-support.js';

describe('build adapter support', () => {
	it('selects target-specific component contract facets', () => {
		expect(exactComponentContractProjection('client', undefined)).toBe('complete');
		expect(exactComponentContractProjection('client', 'hydrate')).toBe('hydrate');
		expect(exactComponentContractProjection('server', undefined)).toBe('complete');
		expect(exactComponentContractProjection('server', 'server-render')).toBe('server-render');
		expect(() => exactComponentContractProjection('client', 'server-render')).toThrow(
			/Server render mode/
		);
		expect(() => exactComponentContractProjection('server', 'client')).toThrow(
			/Client render mode/
		);
	});
	it('emits deterministic application-bundle enhancement registrations', () => {
		const code = prependExactEnhancementRegistrations('export const view = 1;', [
			{
				identity: '@exactjs/motion#default',
				moduleSpecifier: '@exactjs/motion',
				exportName: 'default'
			},
			{
				identity: '@exactjs/motion#default',
				moduleSpecifier: '@exactjs/motion',
				exportName: 'default'
			}
		]);

		expect(code.match(/import __exactEnhancement/g)).toHaveLength(1);
		expect(code).toContain('@exactjs/core/framework/enhancement-catalog');
		expect(code).toContain('__exactRegisterEnhancement("@exactjs/motion#default"');
		const request = code.match(/from "(exact:optional-enhancement\/[^"]+)"/)?.[1];
		expect(parseExactEnhancementFacadeRequest(request!)).toEqual({
			version: 1,
			identity: '@exactjs/motion#default',
			moduleSpecifier: '@exactjs/motion',
			exportName: 'default'
		});
		expect(exactEnhancementFacadeImports).toEqual({
			'@exactjs/dom': '@exactjs/dom/enhanced',
			'@exactjs/hydrate': '@exactjs/hydrate/enhanced',
			'@exactjs/ssr': '@exactjs/ssr/enhanced'
		});
	});

	it('emits target-neutral available and unavailable enhancement facades', () => {
		const request = parseExactEnhancementFacadeRequest(
			exactEnhancementFacadeRequest({
				identity: '@acme/input#gesture',
				moduleSpecifier: '@acme/input',
				exportName: 'gesture'
			})
		)!;
		expect(exactAvailableEnhancementFacadeSource(request)).toBe(
			`export { gesture as default } from "@acme/input";\n`
		);
		expect(exactUnavailableEnhancementFacadeSource()).toContain(
			'exactEnhancementPassThrough as default'
		);
		expect(
			exactAvailableEnhancementFacadeSource(request, '@exactjs/dom/framework/enhancements')
		).toBe(
			`import "@exactjs/dom/framework/enhancements";\nexport { gesture as default } from "@acme/input";\n`
		);
		expect(
			exactUnavailableEnhancementFacadeSource('@exactjs/dom/framework/enhancements')
		).toContain('import "@exactjs/dom/framework/enhancements";');
		expect(() => parseExactEnhancementFacadeRequest('exact:optional-enhancement/not-json')).toThrow(
			/Malformed eXact enhancement facade request/
		);
	});

	it('matches string, regular expression, and mixed path filters', () => {
		expect(matchesExactBuildFilter('/src/view.tsx', '/src/')).toBe(true);
		expect(matchesExactBuildFilter('/src/view.tsx', /\.tsx$/)).toBe(true);
		expect(matchesExactBuildFilter('/src/view.tsx', [/node_modules/, 'view.tsx'])).toBe(true);
		expect(matchesExactBuildFilter('/src/view.ts', [/node_modules/, /\.tsx$/])).toBe(false);
	});

	it('resets stateful regular expressions between filter checks', () => {
		const filter = /view/g;
		expect(matchesExactBuildFilter('/src/view.tsx', filter)).toBe(true);
		expect(matchesExactBuildFilter('/src/view.tsx', filter)).toBe(true);
	});

	it('applies common source, test, dependency, and authored filters', () => {
		expect(isExactGeneratedArtifactModule('/src/view.exact.client.ts')).toBe(true);
		expect(isExactGeneratedArtifactModule('/src/view.exact.server.js?direct')).toBe(true);
		expect(isExactGeneratedArtifactModule('/src/view.tsx')).toBe(false);
		expect(shouldTransformExactBuildModulePath('/src/view.exact.client.ts', {})).toBe(false);
		expect(shouldTransformExactBuildModulePath('/src/view.test.tsx', {})).toBe(false);
		expect(
			shouldTransformExactBuildModulePath('/src/view.test.tsx', { compileTestModules: true })
		).toBe(true);
		expect(shouldCompileExactBuildModule('/src/view.tsx', 'const view = <span />;', {})).toBe(true);
		expect(
			shouldCompileExactBuildModule(
				'/src/planned.ts',
				'function Planned(this: Component<{}>) { return () => createOperation("p"); }',
				{}
			)
		).toBe(true);
		expect(
			shouldCompileExactBuildModule(
				'/src/provider.js',
				'export function Provider(props) { return () => props.children; }',
				{}
			)
		).toBe(true);
		expect(
			shouldCompileExactBuildModule(
				'/src/math.ts',
				'export function add(a, b) { return a + b; }',
				{}
			)
		).toBe(false);
		expect(
			shouldCompileExactBuildModule(
				'/app/packages/core/dist/component.js',
				'function Component() { return () => value; }',
				{}
			)
		).toBe(false);
		expect(
			shouldCompileExactBuildModule(
				'/app/node_modules/library/view.tsx',
				'const view = <span />;',
				{}
			)
		).toBe(false);
		expect(
			shouldCompileExactBuildModule('/vendor/view.tsx', 'const view = <span />;', {
				include: '/vendor/'
			})
		).toBe(true);
		expect(
			shouldCompileExactBuildModule('/src/components.ts', 'export function Component() {}', {
				include: '/src/components.ts'
			})
		).toBe(true);
		expect(
			shouldCompileExactBuildModule(
				'/src/components.exact.client.ts',
				'function Component() { return () => value; }',
				{ include: '/src/' }
			)
		).toBe(false);
	});

	it('formats and keys diagnostics consistently', () => {
		const diagnostic = {
			code: 'TS2322',
			message: 'Type string is not assignable to number',
			filename: '/src/model.ts',
			span: { line: 4, column: 7 }
		};
		expect(exactDiagnosticKey(diagnostic)).toBe(
			'TS2322:4:7:Type string is not assignable to number'
		);
		expect(formatExactDiagnostic(diagnostic)).toBe(
			'/src/model.ts:4:7 - TS2322: Type string is not assignable to number'
		);
	});

	it('reports only newly introduced diagnostics and releases invalidated files', () => {
		const report = createExactDiagnosticReporter();
		const warnings: string[] = [];
		const diagnostic = {
			code: 'TS2322',
			message: 'Type string is not assignable to number',
			filename: '/src/model.ts'
		};

		report({ affectedFiles: ['/src/model.ts'], diagnostics: [diagnostic] }, (warning) =>
			warnings.push(warning)
		);
		report({ affectedFiles: ['/src/model.ts'], diagnostics: [diagnostic] }, (warning) =>
			warnings.push(warning)
		);
		expect(warnings).toHaveLength(1);

		report({ affectedFiles: ['/src/model.ts'], diagnostics: [] }, (warning) =>
			warnings.push(warning)
		);
		report({ affectedFiles: ['/src/model.ts'], diagnostics: [diagnostic] }, (warning) =>
			warnings.push(warning)
		);
		expect(warnings).toHaveLength(2);
	});

	it('normalizes invalidated Windows paths before releasing diagnostics', () => {
		const report = createExactDiagnosticReporter();
		const warnings: string[] = [];
		const diagnostic = { code: 'EXACT1', message: 'changed', filename: 'C:/src/model.ts' };

		report({ affectedFiles: [], diagnostics: [diagnostic] }, (warning) => warnings.push(warning));
		report({ affectedFiles: ['C:\\src\\model.ts'], diagnostics: [] }, (warning) =>
			warnings.push(warning)
		);
		report({ affectedFiles: [], diagnostics: [diagnostic] }, (warning) => warnings.push(warning));
		expect(warnings).toHaveLength(2);
	});

	it('runs native compilation through one normalized adapter result', () => {
		const result = transformExactAdapterModule({
			source: 'const view = <span />;',
			filename: '/src/view.tsx',
			jsxOwnership: 'exact',
			usesReactRuntimeImports: false,
			transformReact: true,
			shouldCompile: true,
			compiler: { options: { sourceMap: true } }
		});

		expect(result).toMatchObject({ map: { sources: ['/src/view.tsx'] } });
		expect(result?.code).toContain('__exactPreparedRenderProgram(__exact_render_program_1');
		expect(result?.code).toContain('directClaims: true');
		expect(result?.code).not.toMatch(/\bnodes:\s*\[/);
		expect(result?.code).not.toMatch(/\bslots:\s*\[/);
		expect(result?.code).not.toMatch(/\bbindings:\s*\[/);
	});

	it('selects React work before native compilation and skips it without compatibility', () => {
		const transformed = transformExactAdapterModule({
			source: 'const view = <Foreign />;',
			filename: '/src/react.tsx',
			jsxOwnership: 'react',
			usesReactRuntimeImports: false,
			transformReact: true,
			shouldCompile: true,
			react: () => ({ code: 'react output' }),
			compiler: { options: {} }
		});
		const skipped = transformExactAdapterModule({
			source: 'const view = <Foreign />;',
			filename: '/src/react.tsx',
			jsxOwnership: 'react',
			usesReactRuntimeImports: false,
			transformReact: true,
			shouldCompile: true,
			compiler: { options: {} }
		});

		expect(transformed).toMatchObject({ code: 'react output' });
		expect(skipped).toBeNull();
	});

	it('reports compatibility warnings and normalizes contextual failures', () => {
		const warnings: string[] = [];
		const result = transformExactAdapterModule({
			source: 'export const value = legacy;',
			filename: '/src/legacy.ts',
			jsxOwnership: 'unknown',
			usesReactRuntimeImports: false,
			transformReact: false,
			shouldCompile: false,
			compiler: { options: {} },
			compatibility: () => ({
				changed: true,
				code: 'rewritten',
				diagnostics: [{ severity: 'warning', message: 'legacy import' }]
			}),
			warn: (warning) => warnings.push(warning)
		});

		expect(result).toMatchObject({ code: 'rewritten' });
		expect(warnings).toEqual(['legacy import']);
		expect(() =>
			transformExactAdapterModule({
				source: 'broken',
				filename: '/src/broken.tsx',
				errorId: '/src/broken.tsx?tool',
				jsxOwnership: 'react',
				usesReactRuntimeImports: false,
				transformReact: true,
				shouldCompile: false,
				react: () => {
					throw new Error('bad syntax');
				},
				compiler: { options: {} }
			})
		).toThrow('eXact JSX transform failed for /src/broken.tsx?tool\nbad syntax');
	});
});

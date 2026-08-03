import { describe, expect, it } from 'vitest';
import {
	createExactDiagnosticReporter,
	exactEnhancementFacadeImports,
	exactDiagnosticKey,
	formatExactDiagnostic,
	shouldCompileExactBuildModule,
	shouldTransformExactBuildModulePath,
	matchesExactBuildFilter,
	prependExactEnhancementRegistrations,
	transformExactAdapterModule
} from './adapter-support.js';

describe('build adapter support', () => {
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

		expect(code.match(/import \* as __exactEnhancement/g)).toHaveLength(1);
		expect(code).toContain('@exactjs/core/framework/enhancement-catalog');
		expect(code).toContain('__exactRegisterEnhancement("@exactjs/motion#default"');
		expect(exactEnhancementFacadeImports).toEqual({
			'@exactjs/dom': '@exactjs/dom/enhanced',
			'@exactjs/hydrate': '@exactjs/hydrate/enhanced',
			'@exactjs/ssr': '@exactjs/ssr/enhanced'
		});
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
		expect(shouldTransformExactBuildModulePath('/src/view.test.tsx', {})).toBe(false);
		expect(
			shouldTransformExactBuildModulePath('/src/view.test.tsx', { compileTestModules: true })
		).toBe(true);
		expect(shouldCompileExactBuildModule('/src/view.tsx', 'const view = <span />;', {})).toBe(true);
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
		expect(result?.code).toContain('__exactVNode("span"');
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

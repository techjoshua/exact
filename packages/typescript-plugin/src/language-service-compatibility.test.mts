import ts = require('typescript');
import { describe, expect, it } from 'vitest';
import initialize from './plugin.js';

describe('eXact TypeScript language-service compatibility', () => {
	it('accepts component-owned this inside local functions', () => {
		const source = `
interface Component<State> { state: State }
export function Counter(this: Component<{ count: number }>) {
  function increment() {
    this.state.count++;
  }
  return increment;
}`;
		const { original, enhanced } = diagnostics(source, 'Counter.ts');

		expect(original.map((diagnostic) => diagnostic.code)).toContain(2683);
		expect(enhanced.map((diagnostic) => diagnostic.code)).not.toContain(2683);
	});

	it('completes the enclosing component this type inside local functions', () => {
		const source = `
interface Component<State> { state: State; getContext(name: string): unknown }
export function Counter(this: Component<{ count: number }>) {
  function increment() {
    this.
  }
  return increment;
}`;
		const completions = completionNames(source, 'Counter.ts', source.indexOf('this.') + 5);

		expect(completions).toEqual(expect.arrayContaining(['state', 'getContext']));
	});

	it('retains implicit-this errors outside an authored component receiver', () => {
		const source = `
export function createCounter() {
  function increment() {
    return this.count++;
  }
  return increment;
}`;
		const { enhanced } = diagnostics(source, 'counter.ts');

		expect(enhanced.map((diagnostic) => diagnostic.code)).toContain(2683);
	});

	it('counts exact-plugin JSX namespaces as import usage', () => {
		const source = `
import motion from './motion.js' with { type: 'exact-plugin' };
declare namespace JSX { interface IntrinsicElements { div: Record<string, unknown> } }
export const view = <div motion:animate="in" />;`;
		const { original, enhanced } = diagnostics(source, 'Motion.tsx');

		expect(original.map((diagnostic) => diagnostic.code)).toContain(6133);
		expect(enhanced.map((diagnostic) => diagnostic.code)).not.toContain(6133);
	});

	it('completes finite enhancement props using namespaced JSX spelling', () => {
		const source = `
import motion from './motion.js' with { type: 'exact-plugin' };
declare namespace JSX { interface IntrinsicElements { div: Record<string, unknown> } }
export const view = <div motion: />;`;
		const completions = completionNames(source, 'Motion.tsx', source.indexOf('motion:') + 7);

		expect(completions).toEqual(expect.arrayContaining(['apply', 'layout-id', 'root']));
		expect(completions).not.toContain('children');
	});

	it('retains an unrelated unused enhancement import', () => {
		const source = `
import motion from './motion.js' with { type: 'exact-plugin' };
import gravity from './gravity.js' with { type: 'exact-plugin' };
declare namespace JSX { interface IntrinsicElements { div: Record<string, unknown> } }
export const view = <div motion:animate="in" />;`;
		const { enhanced } = diagnostics(source, 'Named.tsx');

		expect(
			enhanced.some(
				(diagnostic) =>
					diagnostic.code === 6133 &&
					ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n').includes('gravity')
			)
		).toBe(true);
	});

	it('retains unused diagnostics without matching enhancement syntax', () => {
		const ordinary = `
import motion from './motion.js';
declare namespace JSX { interface IntrinsicElements { div: Record<string, unknown> } }
export const view = <div motion:animate="in" />;`;
		const unusedEnhancement = `
import motion from './motion.js' with { type: 'exact-plugin' };
export const view = 1;`;

		expect(diagnostics(ordinary, 'Ordinary.tsx').enhanced.map(({ code }) => code)).toContain(6133);
		expect(diagnostics(unusedEnhancement, 'Unused.tsx').enhanced.map(({ code }) => code)).toContain(
			6133
		);
	});
});

function diagnostics(source: string, filename: string) {
	const { original, enhanced } = languageServices(source, filename);
	return {
		original: original.getSemanticDiagnostics(filename),
		enhanced: enhanced.getSemanticDiagnostics(filename)
	};
}

function languageServices(source: string, filename: string) {
	const files = new Map([
		[filename, source],
		[
			'motion.d.ts',
			`type Props = { apply?: string; layoutId?: string; children?: unknown };
declare const motion: (props: Props) => unknown;
declare const gravity: (props: { strength?: number }) => unknown;
export { motion, gravity };
export default motion;`
		]
	]);
	const host: ts.LanguageServiceHost = {
		fileExists: (name) => files.has(name.replace(/^.*[\\/]/, '')),
		getCompilationSettings: () => ({
			allowArbitraryExtensions: true,
			jsx: ts.JsxEmit.Preserve,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			noImplicitThis: true,
			noUnusedLocals: true,
			strict: true,
			target: ts.ScriptTarget.ESNext
		}),
		getCurrentDirectory: () => '',
		getDefaultLibFileName: () => 'lib.d.ts',
		getScriptFileNames: () => [...files.keys()],
		getScriptSnapshot: (name) => {
			const contents = files.get(name);
			return contents === undefined ? undefined : ts.ScriptSnapshot.fromString(contents);
		},
		getScriptVersion: () => '1',
		readFile: (name) => files.get(name.replace(/^.*[\\/]/, '')),
		resolveModuleNames: (names) =>
			names.map((name) =>
				name === './motion.js' || name === './gravity.js'
					? { resolvedFileName: 'motion.d.ts', extension: ts.Extension.Dts }
					: undefined
			)
	};
	const languageService = ts.createLanguageService(host);
	const plugin = initialize({ typescript: ts });
	const enhanced = plugin.create({ languageService } as ts.server.PluginCreateInfo);
	return {
		original: languageService,
		enhanced
	};
}

function completionNames(source: string, filename: string, position: number): string[] {
	const { enhanced } = languageServices(source, filename);
	return (
		enhanced.getCompletionsAtPosition(filename, position, {})?.entries.map(({ name }) => name) ?? []
	);
}

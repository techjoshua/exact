import { transformSource } from '@exactjs/compiler';
import { createReactCompatibilityBuildEngine } from '@exactjs/react-compat/build';
import {
	jsxSourceOwnership,
	resolveReactCompatibility,
	type ReactCompatibilityOptions
} from '@exactjs/react-compat/plugin';
import { transformReactJsx, usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import { statSync } from 'node:fs';
import ts from 'typescript';

type JestTransformOptions = {
	supportsStaticESM?: boolean;
	transformerConfig?: {
		reactCompatibility?: boolean | ReactCompatibilityOptions;
	};
};

/** Creates the Jest transformer used for eXact TypeScript and TSX modules. */
export function createTransformer() {
	const compatibilityEngines = new Map<
		string,
		ReturnType<typeof createReactCompatibilityBuildEngine>
	>();
	const engineFor = (
		requested: boolean | ReactCompatibilityOptions,
		target: 18 | 19,
		sourcePath: string
	) => {
		const cwd = typeof requested === 'object' && requested.cwd ? requested.cwd : process.cwd();
		const configured = typeof requested === 'object' ? { ...requested, cwd } : { target, cwd };
		const key = stableSerialize(configured);
		let engine = compatibilityEngines.get(key);
		if (!engine) {
			engine = createReactCompatibilityBuildEngine(configured);
			compatibilityEngines.set(key, engine);
		}
		engine.invalidate(sourcePath);
		return engine;
	};
	return {
		process(sourceText: string, sourcePath: string, options?: JestTransformOptions) {
			const requestedCompatibility = options?.transformerConfig?.reactCompatibility;
			const compatibility =
				requestedCompatibility === undefined
					? undefined
					: resolveReactCompatibility(requestedCompatibility, process.cwd());
			const engine = compatibility
				? engineFor(requestedCompatibility!, compatibility.target, sourcePath)
				: undefined;
			const ownership = jsxSourceOwnership(sourcePath, sourceText, compatibility);
			const reactOwned =
				ownership === 'react' ||
				(ownership === 'unknown' && usesReactRuntimeImports(sourceText, sourcePath));
			const exactSource = /\.tsx$/i.test(sourcePath)
				? reactOwned && compatibility
					? transformReactJsx(sourceText, {
							filename: sourcePath,
							target: compatibility.target,
							sourceMap: false
						}).code
					: !isTestModule(sourcePath)
						? transformSource(sourceText, {
								filename: sourcePath,
								jsxInterop: engine?.jsxInterop,
								moduleTransform: engine
									? ({ id, source, target }) =>
											engine.transformModule({
												id,
												source,
												format: 'module',
												target: target === 'server' ? 'server' : 'client',
												sourceMap: false
											})
									: undefined
							}).code
						: sourceText
				: sourceText;
			const transpiled = ts.transpileModule(exactSource, {
				fileName: sourcePath,
				compilerOptions: {
					target: ts.ScriptTarget.ES2022,
					module: options?.supportsStaticESM ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS,
					jsx: ts.JsxEmit.ReactJSX,
					jsxImportSource: '@exactjs/jsx',
					sourceMap: true,
					inlineSources: true
				}
			});
			return {
				code: transpiled.outputText,
				map: transpiled.sourceMapText
			};
		},
		getCacheKey(sourceText: string, sourcePath: string, options?: JestTransformOptions) {
			return `${ts.version}\0${compatibilityFingerprint(options)}\0${sourcePath}\0${sourceText}`;
		}
	};
}

function compatibilityFingerprint(options: JestTransformOptions | undefined): string {
	const config = options?.transformerConfig ?? {};
	const requested = config.reactCompatibility;
	if (requested === undefined) return stableSerialize(config);
	const cwd = typeof requested === 'object' && requested.cwd ? requested.cwd : process.cwd();
	const resolved = resolveReactCompatibility(requested, cwd);
	if (!resolved) return stableSerialize(config);
	const engine = createReactCompatibilityBuildEngine(
		typeof requested === 'object' ? requested : { target: resolved.target, cwd }
	);
	const watched = engine.watchFiles.map((filename) => {
		try {
			const stat = statSync(filename);
			return [filename, stat.size, stat.mtimeMs];
		} catch {
			return [filename, 'missing'];
		}
	});
	return stableSerialize({
		config,
		buildRoot: engine.report().buildRoot,
		registryHash: engine.registryHash,
		watched
	});
}

function stableSerialize(value: unknown): string {
	if (value instanceof RegExp) return JSON.stringify({ regex: value.source, flags: value.flags });
	if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
	if (value && typeof value === 'object')
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
			.join(',')}}`;
	return JSON.stringify(value);
}

function isTestModule(sourcePath: string): boolean {
	return /(?:^|[\\/])[^\\/]+\.(?:test|spec|jest)\.[cm]?[jt]sx?$/i.test(sourcePath);
}

export default { createTransformer };

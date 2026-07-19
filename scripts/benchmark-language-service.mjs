import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createExpressionLanguageService } from '../packages/expressions/dist/index.js';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const fixtureRoot = path.join(root, '.tmp', 'language-service-benchmark');
const benchmarkConfig = path.join(fixtureRoot, 'tsconfig.json');
const samples = 30;

fs.mkdirSync(fixtureRoot, { recursive: true });
fs.writeFileSync(
	benchmarkConfig,
	JSON.stringify({
		compilerOptions: {
			target: 'ES2022',
			module: 'NodeNext',
			moduleResolution: 'NodeNext',
			strict: true,
			noLib: true,
			noEmit: true
		},
		include: ['**/*.ts']
	})
);
fs.writeFileSync(path.join(fixtureRoot, 'placeholder.ts'), 'export {};\n');

function percentile(values, ratio) {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function synchronize(service, changes) {
	const started = performance.now();
	const update = service.synchronize(changes);
	return { update, elapsed: performance.now() - started };
}

{
	const service = createExpressionLanguageService({ tsconfigPath: benchmarkConfig });
	const leaf = path.join(fixtureRoot, 'LanguageBenchmarkLeaf.ts');
	try {
		service.synchronize([{ kind: 'upsert', filename: leaf, source: 'export const value = 1;' }]);
		const timings = [];
		for (let index = 0; index < samples; index++) {
			const result = synchronize(service, [
				{
					kind: 'upsert',
					filename: leaf,
					source: `export const value = 1;\n// implementation revision ${index}`
				}
			]);
			assert.deepEqual(result.update.affectedFiles, [leaf.replaceAll('\\', '/')]);
			assert.deepEqual(result.update.diagnostics, []);
			timings.push(result.elapsed);
		}
		console.log(
			`language-service warm implementation-only (${samples} samples): median ${percentile(timings, 0.5).toFixed(2)}ms, p95 ${percentile(timings, 0.95).toFixed(2)}ms`
		);
	} finally {
		service.dispose();
	}
}

{
	const service = createExpressionLanguageService({ tsconfigPath: benchmarkConfig });
	const model = path.join(fixtureRoot, 'LanguageBenchmarkModel.ts');
	const consumer = path.join(fixtureRoot, 'LanguageBenchmarkConsumer.ts');
	try {
		service.synchronize([
			{
				kind: 'upsert',
				filename: model,
				source:
					'export interface Model { value: number }\nexport const model: Model = { value: 1 };'
			},
			{
				kind: 'upsert',
				filename: consumer,
				source:
					'import { model } from "./LanguageBenchmarkModel.js";\nexport const value: number = model.value;'
			}
		]);
		const result = synchronize(service, [
			{
				kind: 'upsert',
				filename: model,
				source:
					'export interface Model { value: string }\nexport const model: Model = { value: "changed" };'
			}
		]);
		assert(
			result.update.affectedFiles.some(
				(filename) => filename.toLowerCase() === consumer.replaceAll('\\', '/').toLowerCase()
			)
		);
		assert(result.update.diagnostics.some((diagnostic) => diagnostic.code === 'TS2322'));
		console.log(
			`language-service exported-shape propagation: ${result.elapsed.toFixed(2)}ms, ${result.update.affectedFiles.length} affected, TS2322 confirmed`
		);
	} finally {
		service.dispose();
	}
}

// Minimal public TypeScript builder host retained as a correctness reference.
{
	const model = path.join(root, '.tmp', 'LanguageReferenceModel.ts');
	const consumer = path.join(root, '.tmp', 'LanguageReferenceConsumer.ts');
	const sources = new Map([
		[
			model,
			{
				version: 1,
				source:
					'export interface Model { value: number }\nexport const model: Model = { value: 1 };'
			}
		],
		[
			consumer,
			{
				version: 1,
				source:
					'import { model } from "./LanguageReferenceModel.js";\nexport const value: number = model.value;'
			}
		]
	]);
	const options = {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		incremental: true,
		composite: true,
		declaration: true,
		noEmit: true,
		noLib: true
	};
	const base = ts.createCompilerHost(options, true);
	const cache = new Map();
	const host = {
		...base,
		fileExists: (filename) => sources.has(path.resolve(filename)),
		readFile: (filename) => sources.get(path.resolve(filename))?.source,
		getSourceFile: (filename, languageVersion) => {
			const entry = sources.get(path.resolve(filename));
			if (!entry) return undefined;
			const prior = cache.get(filename);
			if (prior?.version === entry.version) return prior.file;
			const file = ts.createSourceFile(filename, entry.source, languageVersion, true);
			file.version = String(entry.version);
			cache.set(filename, { version: entry.version, file });
			return file;
		}
	};
	let builder = ts.createSemanticDiagnosticsBuilderProgram([model, consumer], options, host);
	while (builder.getSemanticDiagnosticsOfNextAffectedFile()) {
		// Drain the affected-file queue so the next measurement starts from a stable program.
	}
	sources.set(model, {
		version: 2,
		source:
			'export interface Model { value: string }\nexport const model: Model = { value: "changed" };'
	});
	builder = ts.createSemanticDiagnosticsBuilderProgram([model, consumer], options, host, builder);
	const affected = [];
	let next;
	while ((next = builder.getSemanticDiagnosticsOfNextAffectedFile())) {
		if ('fileName' in next.affected) affected.push(path.basename(next.affected.fileName));
	}
	assert(affected.includes(path.basename(consumer)));
	console.log(`minimal TypeScript builder reference: ${affected.join(', ')}`);
}

fs.rmSync(fixtureRoot, { recursive: true, force: true });

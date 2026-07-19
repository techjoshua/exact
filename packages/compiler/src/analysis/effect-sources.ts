import path from 'node:path';
import type {
	ExactCallableSummaryIR,
	ExactCompilerManifest,
	ExactEnvironmentEffectSourceIR
} from '../types.js';

export function source(
	environment: 'browser' | 'server' | 'unknown',
	description: string,
	owner: string
): ExactEnvironmentEffectSourceIR {
	return Object.freeze({ environment, description, path: [owner, description] });
}

export function prepend(
	value: ExactEnvironmentEffectSourceIR,
	owner: string
): ExactEnvironmentEffectSourceIR {
	return Object.freeze({
		...value,
		path: value.path[0] === owner ? value.path : [owner, ...value.path]
	});
}

export function uniqueSources(
	values: readonly ExactEnvironmentEffectSourceIR[]
): ExactEnvironmentEffectSourceIR[] {
	const shortest = new Map<string, ExactEnvironmentEffectSourceIR>();
	for (const value of values) {
		const key = `${value.environment}:${value.description}`;
		const current = shortest.get(key);
		if (
			!current ||
			value.path.length < current.path.length ||
			(value.path.length === current.path.length && value.path.join('.') < current.path.join('.'))
		)
			shortest.set(key, value);
	}
	return [...shortest.values()].sort((left, right) =>
		`${left.environment}:${left.description}:${left.path.join('.')}`.localeCompare(
			`${right.environment}:${right.description}:${right.path.join('.')}`
		)
	);
}

export function sourceSignature(values: readonly ExactEnvironmentEffectSourceIR[]): string {
	return values
		.map((value) => `${value.environment}:${value.description}:${value.path.join('>')}`)
		.join('|');
}

export function externalCallableIndex(
	filename: string,
	manifests: readonly ExactCompilerManifest[]
): Map<string, ExactCallableSummaryIR> {
	const result = new Map<string, ExactCallableSummaryIR>();
	const sourceDir = path.dirname(path.resolve(filename));
	for (const manifest of manifests)
		for (const callable of manifest.callables ?? [])
			for (const exportName of callable.exportNames) {
				const relative = relativeSpecifier(sourceDir, manifest.filename);
				result.set(externalKey(relative, exportName), callable);
				result.set(externalKey(manifest.filename, exportName), callable);
			}
	return result;
}

export function externalModuleInitializers(
	filename: string,
	moduleSpecifier: string,
	manifests: readonly ExactCompilerManifest[]
): ExactCallableSummaryIR[] {
	const sourceDir = path.dirname(path.resolve(filename));
	return manifests
		.filter(
			(manifest) =>
				externalKey(relativeSpecifier(sourceDir, manifest.filename), '') ===
				externalKey(moduleSpecifier, '')
		)
		.flatMap((manifest) =>
			manifest.callables.filter((callable) => callable.kind === 'module-initializer')
		);
}

export function relativeSpecifier(from: string, target: string): string {
	let value = path
		.relative(from, path.resolve(target))
		.replace(/\\/g, '/')
		.replace(/\.[cm]?[jt]sx?$/i, '');
	if (!value.startsWith('.')) value = `./${value}`;
	return value;
}

export function externalKey(specifier: string, exportName: string): string {
	return `${specifier.replace(/\\/g, '/').replace(/\.[cm]?[jt]sx?$/i, '')}:${exportName}`;
}

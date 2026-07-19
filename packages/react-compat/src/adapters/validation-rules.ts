import {
	dependencyRange,
	reactCompatAdapterMarkerPackage,
	reactCompatAdapterProtocolVersion,
	type ReactCompatAdapterDeclaration
} from '@exact/react-compat-adapter-api';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { satisfies, validRange } from 'semver';
import type { ReactCompatPackageNode } from './contracts.js';
import { isRecord } from './package-graph.js';

export function validateReplacementTypeDeclarations(
	node: ReactCompatPackageNode,
	declaration: ReactCompatAdapterDeclaration
): void {
	for (const source of Object.values(declaration.substitutions))
		for (const variant of source.variants)
			for (const replacement of Object.values(variant.exports)) {
				const target = exportTarget(node.manifest.exports, replacement.subpath);
				if (!target) continue;
				const typesTarget =
					conditionalTarget(target, 'types') ??
					conditionalTarget(target, 'default') ??
					(typeof target === 'string' ? target : undefined);
				if (!typesTarget)
					throw new Error(
						`React compatibility adapter ${packageName(node)} cannot resolve a type declaration for ${replacement.subpath}`
					);
				const declarationFile = path.resolve(
					node.location,
					typesTarget.replace(/\.(?:m|c)?js$/, '.d.ts')
				);
				let sourceText: string;
				try {
					sourceText = readFileSync(declarationFile, 'utf8');
				} catch {
					throw new Error(
						`React compatibility adapter ${packageName(node)} type declaration ${declarationFile} was not found; build the adapter before validation`
					);
				}
				if (!declaresExport(sourceText, replacement.export)) {
					throw new Error(
						`React compatibility adapter ${packageName(node)} type declaration ${declarationFile} does not export ${replacement.export}`
					);
				}
			}
}

export function exportTarget(exportsField: unknown, subpath: string): unknown {
	if (typeof exportsField === 'string' || Array.isArray(exportsField))
		return subpath === '.' ? exportsField : undefined;
	if (!isRecord(exportsField)) return undefined;
	if (Object.prototype.hasOwnProperty.call(exportsField, subpath)) return exportsField[subpath];
	return subpath === '.' && Object.keys(exportsField).every((key) => !key.startsWith('.'))
		? exportsField
		: undefined;
}

export function conditionalTarget(value: unknown, condition: string): string | undefined {
	if (typeof value === 'string') return value;
	if (Array.isArray(value))
		return value.map((item) => conditionalTarget(item, condition)).find(Boolean);
	if (!isRecord(value)) return undefined;
	return (
		conditionalTarget(value[condition], condition) ??
		(condition !== 'default' ? conditionalTarget(value.default, condition) : undefined) ??
		Object.values(value)
			.map((item) => conditionalTarget(item, condition))
			.find(Boolean)
	);
}

export function declaresExport(source: string, exportName: string): boolean {
	if (exportName === 'default') return /\bexport\s+default\b/.test(source);
	const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return (
		new RegExp(
			`\\bexport\\s+(?:declare\\s+)?(?:const|let|var|function|class|enum)\\s+${escaped}\\b`
		).test(source) ||
		[...source.matchAll(/\bexport\s*\{([^}]*)\}/g)].some((match) =>
			match[1]!.split(',').some((item) => {
				const names = item
					.trim()
					.replace(/^type\s+/, '')
					.split(/\s+as\s+/);
				return (names[1] ?? names[0])?.trim() === exportName;
			})
		)
	);
}

export function validateAdapterExports(
	node: ReactCompatPackageNode,
	declaration: ReactCompatAdapterDeclaration
): void {
	for (const source of Object.values(declaration.substitutions))
		for (const variant of source.variants)
			for (const replacement of Object.values(variant.exports)) {
				if (!manifestExportsSubpath(node.manifest.exports, replacement.subpath)) {
					throw new Error(
						`React compatibility adapter ${packageName(node)} replacement subpath ${replacement.subpath} is not a public package export`
					);
				}
			}
}

export function validateProtocolRange(node: ReactCompatPackageNode): void {
	const range =
		dependencyRange(node.manifest.dependencies, reactCompatAdapterMarkerPackage) ??
		dependencyRange(node.manifest.optionalDependencies, reactCompatAdapterMarkerPackage);
	if (!range) return;
	// Workspace/file dependencies are resolved to a concrete package version by
	// the package graph. Published semver ranges must opt into protocol major 1.
	if (range.startsWith('file:') || range.startsWith('workspace:')) return;
	if (!validRange(range) || !satisfies(reactCompatAdapterProtocolVersion, range)) {
		throw new Error(
			`React compatibility adapter ${packageName(node)} declares incompatible ${reactCompatAdapterMarkerPackage} range ${JSON.stringify(range)}; expected a range accepting ${reactCompatAdapterProtocolVersion}`
		);
	}
}

export function manifestExportsSubpath(exportsField: unknown, subpath: string): boolean {
	const target = exportTarget(exportsField, subpath);
	return (
		target !== undefined &&
		resolvesExportTarget(target, new Set(['exact-client', 'browser', 'import', 'default'])) &&
		resolvesExportTarget(target, new Set(['exact-server', 'node', 'import', 'default']))
	);
}

export function resolvesExportTarget(value: unknown, conditions: ReadonlySet<string>): boolean {
	if (typeof value === 'string') return value.length > 0;
	if (Array.isArray(value)) return value.some((item) => resolvesExportTarget(item, conditions));
	if (!isRecord(value)) return false;
	for (const [condition, target] of Object.entries(value)) {
		if (condition === 'types') continue;
		if (conditions.has(condition)) return resolvesExportTarget(target, conditions);
	}
	return false;
}

export function packageName(node: ReactCompatPackageNode): string {
	if (typeof node.manifest.name !== 'string' || !node.manifest.name)
		throw new Error(`${node.location}/package.json must declare a package name`);
	return node.manifest.name;
}

export function packageVersion(node: ReactCompatPackageNode): string {
	if (typeof node.manifest.version !== 'string' || !node.manifest.version)
		throw new Error(`${node.location}/package.json must declare a package version`);
	return node.manifest.version;
}

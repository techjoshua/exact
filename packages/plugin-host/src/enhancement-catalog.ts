import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { packageDirectlyDependsOnPluginApi } from '@exactjs/plugin-api';
import type { ExactPluginDiscoveryResult } from './discovery.js';
import { packageName, type ExactPackageGraph, type ExactPackageNode } from './graph.js';

/** Describes one trusted compiler-attributed renderer enhancement export. */
export interface ExactPreparedEnhancement {
	readonly identity: string;
	readonly packageName: string;
	readonly subpath: string;
	readonly exportName: string;
}

type PublicTypeEntry = {
	readonly subpath: string;
	readonly specifier: string;
	readonly filename: string;
};

type EnhancementCandidate = ExactPreparedEnhancement & { readonly nodeId: string };

/** Separates compiler-visible declarations from final-application activation trust. */
export interface ExactPreparedEnhancementCatalogs {
	readonly declarations: readonly ExactPreparedEnhancement[];
	readonly trusted: ReadonlyMap<string, ExactPreparedEnhancement>;
}

/** Catalogs attributed exports independently, then applies final-application package trust. */
export function createPreparedEnhancementCatalog(
	graph: ExactPackageGraph,
	discovery: ExactPluginDiscoveryResult
): ExactPreparedEnhancementCatalogs {
	const candidates: EnhancementCandidate[] = [];
	const nodes = [...graph.nodes.values()].filter(
		(node) =>
			node.id === graph.rootId || packageDirectlyDependsOnPluginApi(node.manifest)
	);
	for (const node of nodes.sort((left, right) =>
		packageName(left).localeCompare(packageName(right)) || left.realPath.localeCompare(right.realPath)
	)) {
		for (const entry of publicTypeEntries(node)) {
			for (const exportName of attributedComponentExports(entry.filename)) {
				const identity = `${entry.specifier}#${exportName}`;
				candidates.push({
					nodeId: node.id,
					identity,
					packageName: packageName(node),
					subpath: entry.subpath,
					exportName
				});
			}
		}
	}
	candidates.sort(
		(left, right) =>
			left.identity.localeCompare(right.identity) || left.nodeId.localeCompare(right.nodeId)
	);
	const declarations = Object.freeze(
		candidates.map(({ nodeId: _nodeId, ...candidate }) => Object.freeze(candidate))
	);
	const trustedNodeIds = new Set(
		[...discovery.participants.values()].map((participant) => participant.node.id)
	);
	const trusted = new Map<string, ExactPreparedEnhancement>();
	for (const candidate of candidates) {
		if (!trustedNodeIds.has(candidate.nodeId)) continue;
		if (trusted.has(candidate.identity)) {
			throw new Error(`Duplicate trusted enhancement identity ${candidate.identity}`);
		}
		const { nodeId: _nodeId, ...prepared } = candidate;
		trusted.set(candidate.identity, Object.freeze(prepared));
	}
	return Object.freeze({
		declarations,
		trusted: new Map([...trusted].sort(([left], [right]) => left.localeCompare(right)))
	});
}

function publicTypeEntries(node: ExactPackageNode): PublicTypeEntry[] {
	const name = packageName(node);
	const manifest = node.manifest as Record<string, unknown>;
	const exportsField = manifest.exports;
	const entries: PublicTypeEntry[] = [];
	if (isRecord(exportsField) && Object.keys(exportsField).some((key) => key.startsWith('.'))) {
		for (const [subpath, target] of Object.entries(exportsField)) {
			if (!subpath.startsWith('.')) continue;
			const types = conditionalTarget(target, 'types');
			if (!types) continue;
			const filename = safePackageFile(node, types);
			if (!filename) continue;
			entries.push({
				subpath,
				specifier: subpath === '.' ? name : `${name}${subpath.slice(1)}`,
				filename
			});
		}
	} else {
		const types =
			conditionalTarget(exportsField, 'types') ??
			(typeof manifest.types === 'string' ? manifest.types : undefined);
		const filename = types ? safePackageFile(node, types) : undefined;
		if (filename) entries.push({ subpath: '.', specifier: name, filename });
	}
	return entries.sort((left, right) => left.specifier.localeCompare(right.specifier));
}

function attributedComponentExports(filename: string): readonly string[] {
	const program = ts.createProgram([filename], {
		allowJs: false,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		skipLibCheck: true,
		target: ts.ScriptTarget.ES2022
	});
	const source = program.getSourceFile(filename);
	if (!source) throw new Error(`Unable to read enhancement declaration ${filename}`);
	const checker = program.getTypeChecker();
	const module = checker.getSymbolAtLocation(source);
	if (!module) return [];
	const callable = new Set(
		checker
			.getExportsOfModule(module)
			.filter((symbol) => exportedValueIsCallable(symbol, checker))
			.map((symbol) => symbol.getName())
	);
	const attributed = new Set<string>();
	for (const statement of source.statements) {
		if (!ts.isExportDeclaration(statement) || !hasExactPluginAttribute(statement)) continue;
		if (!statement.exportClause) {
			for (const name of callable) if (name !== 'default') attributed.add(name);
			continue;
		}
		if (!ts.isNamedExports(statement.exportClause)) continue;
		for (const element of statement.exportClause.elements) {
			if (element.isTypeOnly) continue;
			const name = element.name.text;
			if (callable.has(name)) attributed.add(name);
		}
	}
	return [...attributed].sort();
}

function exportedValueIsCallable(symbol: ts.Symbol, checker: ts.TypeChecker): boolean {
	const value = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
	const declaration = value.valueDeclaration ?? value.declarations?.[0];
	if (!declaration || !(value.flags & ts.SymbolFlags.Value)) return false;
	return checker.getTypeOfSymbolAtLocation(value, declaration).getCallSignatures().length > 0;
}

function hasExactPluginAttribute(declaration: ts.ExportDeclaration): boolean {
	return (
		declaration.attributes?.elements.some(
			(attribute) =>
				attribute.name.text === 'type' &&
				ts.isStringLiteral(attribute.value) &&
				attribute.value.text === 'exact-plugin'
		) ?? false
	);
}

function safePackageFile(node: ExactPackageNode, target: string): string | undefined {
	const requested = path.resolve(node.location, target);
	const candidate = declarationCandidate(requested);
	if (!candidate) return undefined;
	if (!existsSync(candidate)) return undefined;
	const resolved = realpathSync(candidate);
	const relative = path.relative(node.realPath, resolved);
	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error(`Enhancement declaration ${target} resolves outside ${node.location}`);
	}
	return resolved;
}

function declarationCandidate(filename: string): string | undefined {
	if (/\.d\.[cm]?ts$/i.test(filename) || /\.[cm]?tsx?$/i.test(filename)) return filename;
	if (/\.mjs$/i.test(filename)) return filename.replace(/\.mjs$/i, '.d.mts');
	if (/\.cjs$/i.test(filename)) return filename.replace(/\.cjs$/i, '.d.cts');
	if (/\.js$/i.test(filename)) return filename.replace(/\.js$/i, '.d.ts');
	return undefined;
}

function conditionalTarget(value: unknown, condition: string): string | undefined {
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) {
		for (const item of value) {
			const target = conditionalTarget(item, condition);
			if (target) return target;
		}
		return undefined;
	}
	if (!isRecord(value)) return undefined;
	return (
		conditionalTarget(value[condition], condition) ??
		(condition === 'types' ? undefined : conditionalTarget(value.default, condition))
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

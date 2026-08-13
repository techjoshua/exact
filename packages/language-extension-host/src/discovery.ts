import type { ExactLanguageExtensionsConfig, ExactLanguagePackageRule } from '@exactjs/config';
import {
	exactLanguageProtocolLimits,
	parseExactDeclarativeLanguageContribution,
	parseExactLanguageDeclaration
} from '@exactjs/language-extension-api';
import {
	resolveExactNodePackage,
	resolveExactPublicPackageEntry
} from '@exactjs/package-provenance';
import type { ExactLanguageProviderDescriptor } from './contracts.js';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Discovers only package names proven relevant by compiler imports or the selected plugin graph. */
export async function discoverExactLanguageProviders(
	workspaceRoot: string,
	packageNames: readonly string[],
	config: ExactLanguageExtensionsConfig | undefined
): Promise<readonly ExactLanguageProviderDescriptor[]> {
	const providers: ExactLanguageProviderDescriptor[] = [];
	const applicationManifest = await readApplicationManifest(workspaceRoot);
	for (const packageName of [...new Set(packageNames)].sort()) {
		let node;
		try {
			node = await resolveExactNodePackage(workspaceRoot, packageName);
		} catch {
			continue;
		}
		const exact = isRecord(node.manifest.exact) ? node.manifest.exact : undefined;
		if (!exact || exact.language === undefined) continue;
		const declaration = parseExactLanguageDeclaration(exact.language);
		const analyzer =
			declaration.analyzer &&
			!ignored(packageName, node.version, node.integrity, config, 'analyzer')
				? declaration.analyzer
				: undefined;
		const trust = analyzer
			? analyzerTrust(packageName, node.version, node.integrity, applicationManifest, config)
			: undefined;
		const declarative =
			declaration.declarative &&
			!ignored(packageName, node.version, node.integrity, config, 'declarative')
				? await loadDeclarative(node, declaration.declarative, packageName)
				: undefined;
		if (!declarative && (!analyzer || !trust)) continue;
		const entry =
			analyzer && trust ? resolveExactPublicPackageEntry(node, analyzer.subpath) : undefined;
		const dataFiles =
			analyzer?.data?.map((subpath) => resolveExactPublicPackageEntry(node, subpath)) ?? [];
		if (entry) await assertDirectApiDependency(node.manifest, node.manifestPath);
		const generationKey = await providerGenerationKey(
			node.key,
			[
				node.manifestPath,
				...(entry ? [entry] : []),
				...(declarative ? [declarative.filename] : []),
				...dataFiles
			],
			config
		);
		providers.push(
			Object.freeze({
				key: generationKey,
				id: packageName,
				version: node.version,
				packageRoot: node.location,
				manifestPath: node.manifestPath,
				...(node.integrity ? { integrity: node.integrity } : {}),
				...(entry ? { entry } : {}),
				...(declarative ? { declarative } : {}),
				dataFiles: Object.freeze(dataFiles),
				capabilities: analyzer && trust ? analyzer.capabilities : [],
				projection: analyzer && trust ? analyzer.projection : [],
				trust: trust ?? 'declarative'
			})
		);
	}
	return Object.freeze(providers);
}

async function providerGenerationKey(
	physicalKey: string,
	files: readonly string[],
	config: ExactLanguageExtensionsConfig | undefined
): Promise<string> {
	const hash = createHash('sha256').update(physicalKey).update('\0');
	for (const filename of [...new Set(files)].sort()) {
		const metadata = await stat(filename);
		hash.update(filename).update('\0').update(String(metadata.size)).update('\0');
		hash.update(String(metadata.mtimeMs)).update('\0');
	}
	hash.update(JSON.stringify(config ?? null));
	return `${physicalKey}\0${hash.digest('base64url')}`;
}

async function readApplicationManifest(root: string): Promise<Readonly<Record<string, unknown>>> {
	try {
		return JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as Record<
			string,
			unknown
		>;
	} catch {
		return {};
	}
}

async function loadDeclarative(
	node: Awaited<ReturnType<typeof resolveExactNodePackage>>,
	subpath: string,
	provider: string
): Promise<ExactLanguageProviderDescriptor['declarative']> {
	const filename = resolveExactPublicPackageEntry(node, subpath);
	const source = await readFile(filename, 'utf8');
	if (Buffer.byteLength(source) > exactLanguageProtocolLimits.declarativeBytes)
		throw new Error(`${filename} exceeds the declarative language contribution byte limit`);
	let value: unknown;
	try {
		value = JSON.parse(source);
	} catch (error) {
		throw new Error(`Unable to parse declarative language contribution ${filename}`, {
			cause: error
		});
	}
	return Object.freeze({
		filename,
		contribution: parseExactDeclarativeLanguageContribution(value, provider)
	});
}

function analyzerTrust(
	name: string,
	version: string,
	integrity: string | undefined,
	rootManifest: Readonly<Record<string, unknown>>,
	config: ExactLanguageExtensionsConfig | undefined
): ExactLanguageProviderDescriptor['trust'] | undefined {
	const policy = config?.analyzers;
	const mode = policy?.mode ?? 'trusted';
	if (mode === 'off') return undefined;
	if (matchesRules(name, version, integrity, policy?.deny)) return undefined;
	if (mode === 'all') return 'all';
	if (matchesRules(name, version, integrity, policy?.allow)) return 'allow';
	if (mode === 'root') return directlyDeclared(rootManifest, name) ? 'root' : undefined;
	const scopes = [
		...(policy?.includeDefaultTrustedScopes === false ? [] : ['@exactjs/']),
		...(policy?.trustedScopes ?? [])
	];
	return scopes.some((scope) => scope.endsWith('/') && name.startsWith(scope))
		? 'scope'
		: undefined;
}

function ignored(
	name: string,
	version: string,
	integrity: string | undefined,
	config: ExactLanguageExtensionsConfig | undefined,
	role: string
): boolean {
	return (config?.ignore ?? []).some((rule) => {
		if (!rule.roles.includes(role as never)) return false;
		if ('provider' in rule && rule.provider) return rule.provider === name;
		return 'package' in rule && rule.package
			? selectorMatches(rule.package, name) &&
					(!rule.version || rule.version === version) &&
					(!rule.integrity || rule.integrity === integrity)
			: false;
	});
}

function matchesRules(
	name: string,
	version: string,
	integrity: string | undefined,
	rules: readonly ExactLanguagePackageRule[] | undefined
): boolean {
	return (rules ?? []).some((rule) => {
		const selector = typeof rule === 'string' ? rule : rule.package;
		return (
			selectorMatches(selector, name) &&
			(typeof rule === 'string' ||
				((!rule.version || rule.version === version) &&
					(!rule.integrity || rule.integrity === integrity)))
		);
	});
}

function directlyDeclared(manifest: Readonly<Record<string, unknown>>, name: string): boolean {
	return ['dependencies', 'devDependencies', 'optionalDependencies'].some((field) => {
		const values = isRecord(manifest[field]) ? manifest[field] : undefined;
		return typeof values?.[name] === 'string';
	});
}

function selectorMatches(selector: string, name: string): boolean {
	return selector.endsWith('/') ? name.startsWith(selector) : selector === name;
}

async function assertDirectApiDependency(
	manifest: Readonly<Record<string, unknown>>,
	manifestPath: string
): Promise<void> {
	const dependencies = isRecord(manifest.dependencies) ? manifest.dependencies : {};
	const peers = isRecord(manifest.peerDependencies) ? manifest.peerDependencies : {};
	if (
		typeof dependencies['@exactjs/language-extension-api'] !== 'string' &&
		typeof peers['@exactjs/language-extension-api'] !== 'string'
	)
		throw new Error(
			`${manifestPath} must directly depend on @exactjs/language-extension-api to publish an analyzer`
		);
	await Promise.resolve();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { intersects, validRange } from 'semver';

export {
	createInstalledReactCompatPackageGraph,
	createNpmReactCompatPackageGraph,
	createReactCompatPackageGraph,
	discoverReactCompatAdapters,
	replacementKey,
	validateReactCompatAdapterPackage,
	type ReactCompatPackageGraph,
	type ReactCompatPackageNode,
	type ResolvedReactCompatAdapters,
	type ResolvedReactCompatReplacement,
	type ResolvedReactCompatSourcePolicy,
	type UnsupportedReactCompatSource
} from './adapters.js';

export type ReactFilterPattern = string | RegExp | readonly (string | RegExp)[];
export type ReactCompatibilityTarget = 'auto' | 18 | 19 | '18' | '19';

export interface ReactCompatibilityOptions {
	target?: ReactCompatibilityTarget;
	source?: ReactFilterPattern;
	strict?: boolean;
	/** Application package root; defaults to process.cwd(). */
	cwd?: string;
}

export interface ResolvedReactCompatibility {
	target: 18 | 19;
	source?: ReactFilterPattern;
	strict: boolean;
	aliases: Readonly<Record<string, string>>;
}

export type JsxSourceOwnership = 'react' | 'exact' | 'unknown';

export function resolveReactCompatibility(
	options: boolean | ReactCompatibilityOptions | undefined = undefined,
	cwd = process.cwd()
): ResolvedReactCompatibility | undefined {
	if (options === false) return undefined;
	const configured = options === true ? {} : options;
	let target: 18 | 19;
	try {
		target = resolveTarget(configured?.target ?? 'auto', cwd);
	} catch (error) {
		// Omitted configuration is automatic-but-optional. Explicit `true` or an
		// options object requests compatibility and therefore reports detection failures.
		if (options === undefined) return undefined;
		throw error;
	}
	return {
		target,
		source: configured?.source,
		strict: configured?.strict ?? true,
		aliases: reactCompatibilityAliases(target)
	};
}

export type ReactReconcilerManifest = {
	version?: string;
	peerDependencies?: { react?: string };
	dependencies?: { scheduler?: string };
};

/** Throws when a discoverable reconciler explicitly targets another React major. */
export function validateReactReconcilerTarget(
	target: 18 | 19,
	manifest: ReactReconcilerManifest
): void {
	const peer = manifest.peerDependencies?.react;
	if (!peer || rangeAllowsMajor(peer, target)) return;
	const version = manifest.version ?? 'unknown';
	const scheduler = manifest.dependencies?.scheduler ?? 'unknown';
	throw new Error(
		`React compatibility target ${target} does not match react-reconciler ${version} ` +
			`(peer react ${peer}, scheduler ${scheduler}). Install a version-matched renderer/reconciler or select the matching target.`
	);
}

export function validateInstalledReactReconciler(target: 18 | 19, cwd = process.cwd()): void {
	try {
		const manifest = JSON.parse(
			readFileSync(findPackageManifest(cwd, 'react-reconciler'), 'utf8')
		) as ReactReconcilerManifest;
		validateReactReconcilerTarget(target, manifest);
	} catch (error) {
		if (error instanceof Error && error.message.startsWith('React compatibility target'))
			throw error;
	}
}

function rangeAllowsMajor(range: string, major: 18 | 19): boolean {
	if (!validRange(range)) {
		throw new Error(
			`React compatibility target ${major} cannot validate invalid react-reconciler peer range ${JSON.stringify(range)}`
		);
	}
	return intersects(range, `>=${major}.0.0-0 <${major + 1}.0.0-0`, { includePrerelease: true });
}

export function reactCompatibilityAliases(target: 18 | 19): Readonly<Record<string, string>> {
	return Object.freeze({
		'react/jsx-runtime': `@exact/react-compat/jsx-runtime${target}`,
		'react/jsx-dev-runtime': `@exact/react-compat/jsx-dev-runtime${target}`,
		'react/compiler-runtime': '@exact/react-compat/compiler-runtime',
		react: `@exact/react-compat/react${target}`,
		'react-dom/client': `@exact/react-dom-compat/client${target}`,
		'react-dom/server': `@exact/react-dom-compat/server${target}`,
		'react-dom/server.browser': `@exact/react-dom-compat/server-browser${target}`,
		'react-dom/server.node': `@exact/react-dom-compat/server${target}`,
		...(target === 19
			? {
					'react-dom/static': '@exact/react-dom-compat/static19',
					'react-dom/static.browser': '@exact/react-dom-compat/static-browser19',
					'react-dom/static.node': '@exact/react-dom-compat/static19'
				}
			: {}),
		'react-dom': `@exact/react-dom-compat/react${target}`
	});
}

export function isReactCompatibilitySource(
	id: string,
	code: string,
	resolved: ResolvedReactCompatibility | undefined
): boolean {
	return jsxSourceOwnership(id, code, resolved) === 'react';
}

/** Resolves explicit JSX ownership before semantic import inference. */
export function jsxSourceOwnership(
	id: string,
	code: string,
	resolved: ResolvedReactCompatibility | undefined
): JsxSourceOwnership {
	const reactPragma = /@jsxImportSource\s+react(?:\s|$)/m.test(code);
	const exactPragma = /@jsxImportSource\s+@exact\/jsx(?:\s|$)/m.test(code);
	if ((resolved?.strict ?? true) && reactPragma && exactPragma) {
		throw new Error(
			`Mixed React and eXact JSX import-source directives are not supported in ${id}`
		);
	}
	if (reactPragma) return 'react';
	if (exactPragma) return 'exact';
	if (resolved?.source && matchesReactFilter(id, resolved.source)) return 'react';
	return 'unknown';
}

function resolveTarget(target: ReactCompatibilityTarget, cwd: string): 18 | 19 {
	if (target === 18 || target === '18') return 18;
	if (target === 19 || target === '19') return 19;
	let version: string;
	try {
		const manifest = JSON.parse(readFileSync(findReactManifest(cwd), 'utf8')) as {
			version?: unknown;
		};
		version = String(manifest.version ?? '');
	} catch (error) {
		throw new Error(
			`Unable to detect React for compatibility mode from ${cwd}; set reactCompatibility.target to 18 or 19`,
			{ cause: error }
		);
	}
	const major = Number.parseInt(version, 10);
	if (major !== 18 && major !== 19)
		throw new Error(
			`React compatibility supports majors 18 and 19; detected ${version || 'an unknown version'}`
		);
	return major;
}

function findReactManifest(cwd: string): string {
	return findPackageManifest(cwd, 'react');
}

function findPackageManifest(cwd: string, packageName: string): string {
	let directory = path.resolve(cwd);
	while (true) {
		const candidate = path.join(
			directory,
			'node_modules',
			...packageName.split('/'),
			'package.json'
		);
		try {
			readFileSync(candidate, 'utf8');
			return candidate;
		} catch {}
		const parent = path.dirname(directory);
		if (parent === directory) throw new Error(`${packageName} package manifest was not found`);
		directory = parent;
	}
}

function matchesReactFilter(id: string, pattern: ReactFilterPattern): boolean {
	const patterns = Array.isArray(pattern) ? pattern : [pattern];
	return patterns.some((item) =>
		typeof item === 'string' ? id.includes(item) : ((item.lastIndex = 0), item.test(id))
	);
}

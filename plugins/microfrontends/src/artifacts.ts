import path from 'node:path';

/** Describes the static exports required from one provided import key. */
export type ExactProvidedPackageBridge = {
	key: string;
	hasDefault?: boolean;
	exportNames?: readonly string[];
	sideEffectOnly?: boolean;
};

/** Describes import syntax encountered while planning a provided-package bridge. */
export type ExactProvidedPackageImportUsage =
	| { kind: 'default' }
	| { kind: 'named'; imported: string }
	| { kind: 'namespace'; exportNames: readonly string[] }
	| { kind: 'side-effect' }
	| { kind: 'dynamic' }
	| { kind: 're-export' };

/** Generates the page module that publishes actual package module instances. */
export function generateProvidedPackageBootstrap(keys: readonly string[]): string {
	const imports: string[] = [];
	const registrations: string[] = [];
	for (const [index, key] of uniqueKeys(keys).entries()) {
		const local = `__exactProvided${index}`;
		imports.push(`import * as ${local} from ${quote(key)};`);
		registrations.push(`__exactRegistry.register(${quote(key)}, ${local});`);
	}
	return [
		`import { getExactProvidedPackageRegistry } from '@exactjs/hydrate';`,
		...imports,
		'',
		'const __exactRegistry = getExactProvidedPackageRegistry();',
		...registrations,
		''
	].join('\n');
}

/** Generates the browser-safe binding table registered before page hydration. */
export function generateExactClientBindingsBootstrap(
	bindings: readonly (
		| readonly [string, { readonly clientEntry: string; readonly integrity?: string }]
		| readonly [
				string,
				{
					readonly clientEntry: string;
					readonly integrity?: string;
					readonly clientEntryResolver: string;
				}
		  ]
	)[],
	options: { applicationRoot: string }
): string {
	if (!bindings.length) return '';
	const imports = [
		`import { registerExactRemoteClientBindings as __exactRegisterBindings } from '@exactjs/microfrontends/client';`
	];
	const properties: string[] = [];
	for (const [index, [binding, config]] of bindings.entries()) {
		validateKey(binding);
		validateKey(config.clientEntry);
		if (config.integrity !== undefined) validateKey(config.integrity);
		let resolver: string | undefined;
		if ('clientEntryResolver' in config) {
			validateKey(config.clientEntryResolver);
			resolver = `__exactResolveEntry${index}`;
			imports.push(
				`import ${resolver} from ${quote(pathSpecifier(options.applicationRoot, config.clientEntryResolver))};`
			);
		}
		properties.push(
			`${quote(binding)}: Object.freeze({ clientEntry: ${quote(config.clientEntry)}${config.integrity ? `, integrity: ${quote(config.integrity)}` : ''}${resolver ? `, resolveClientEntry: ${resolver}` : ''} })`
		);
	}
	return [
		...imports,
		'',
		'__exactRegisterBindings(Object.freeze({',
		...properties.map(
			(property, index) => `\t${property}${index + 1 < properties.length ? ',' : ''}`
		),
		'}));',
		''
	].join('\n');
}

/** Generates the bundler-neutral ESM wrapper consumed by every page runtime. */
export function generateRemoteEntryModule(options: ExactRemoteEntryModuleOptions): string {
	validateBuildKey(options.buildKey);
	validateKey(options.root);
	validateKey(options.componentImport);
	validateKey(options.registrationImport);
	return [
		`import __exactComponent from ${quote(options.componentImport)};`,
		`import { exactHydrationRegistration as __exactRegistration } from ${quote(options.registrationImport)};`,
		'',
		'const __exactRemoteModule = Object.freeze({',
		`\tbuildKey: ${quote(options.buildKey)},`,
		...(options.componentAuthorization
			? [
					`\tcomponentAuthorization: Object.freeze(${JSON.stringify(options.componentAuthorization)}),`
				]
			: []),
		`\troot: ${quote(options.root)},`,
		'\tcomponent: __exactComponent,',
		'\tregistration: __exactRegistration',
		'});',
		`globalThis[Symbol.for('@exactjs/microfrontends/remote-loader')]?.publish(new URL(import.meta.url).searchParams.get('__exact_module_token'), __exactRemoteModule);`,
		'',
		'export default __exactRemoteModule;',
		''
	].join('\n');
}

/** Generates a canonical ESM bridge for the statically observed import shape. */
export function generateProvidedPackageBridge(bridge: ExactProvidedPackageBridge): string {
	validateKey(bridge.key);
	const exportNames = [...new Set(bridge.exportNames ?? [])].sort();
	for (const name of exportNames) validateExportName(name);
	if (bridge.sideEffectOnly && (bridge.hasDefault || exportNames.length))
		throw new Error('A side-effect-only provided-package bridge cannot declare exports');

	const lines = [
		`const __exactRegistry = globalThis[Symbol.for('@exactjs/provided-packages')];`,
		`if (!__exactRegistry || typeof __exactRegistry.require !== 'function') throw new Error('eXact provided-package registry is unavailable');`,
		`const __exactProvided = __exactRegistry.require(${quote(bridge.key)});`
	];
	if (bridge.hasDefault) {
		lines.push('const __exactDefault = __exactProvided.default;');
		lines.push('export { __exactDefault as default };');
	}
	for (const [index, name] of exportNames.entries()) {
		const local = `__exactExport${index}`;
		lines.push(`const ${local} = __exactProvided[${quote(name)}];`);
		lines.push(`export { ${local} as ${name} };`);
	}
	lines.push('');
	return lines.join('\n');
}

/** Converts observed imports to a bridge plan and rejects unsupported syntax. */
export function planProvidedPackageBridge(
	key: string,
	usages: readonly ExactProvidedPackageImportUsage[]
): ExactProvidedPackageBridge {
	validateKey(key);
	const unsupported = usages.find(
		(usage) => usage.kind === 'dynamic' || usage.kind === 're-export'
	);
	if (unsupported)
		throw new Error(
			`${unsupported.kind === 'dynamic' ? 'Dynamic imports' : 'Re-exports'} of provided package ${quote(key)} are not supported`
		);
	const exportNames = usages.flatMap((usage) => {
		if (usage.kind === 'named') return [usage.imported];
		if (usage.kind === 'namespace') return [...usage.exportNames];
		return [];
	});
	return Object.freeze({
		key,
		...(usages.some((usage) => usage.kind === 'default') ? { hasDefault: true } : {}),
		...(exportNames.length ? { exportNames: Object.freeze([...new Set(exportNames)].sort()) } : {}),
		...(usages.length > 0 && usages.every((usage) => usage.kind === 'side-effect')
			? { sideEffectOnly: true }
			: {})
	});
}

function uniqueKeys(keys: readonly string[]): string[] {
	const unique = [...new Set(keys)];
	for (const key of unique) validateKey(key);
	return unique;
}

function validateKey(key: string): void {
	if (typeof key !== 'string' || key.length === 0)
		throw new Error('Provided package key must be a non-empty string');
}

/** Rejects any build identifier other than a full Git commit SHA. */
export function validateBuildKey(key: string): void {
	if (!/^[0-9a-f]{40}$/i.test(key))
		throw new Error('eXact remote build key must be a full Git commit SHA');
}

function validateExportName(name: string): void {
	if (!/^[$A-Z_a-z][$\w]*$/.test(name) || name === 'default')
		throw new Error(`Unsupported provided-package export name ${quote(name)}`);
}

function quote(value: string): string {
	return JSON.stringify(value).replace(/[\u2028\u2029]/g, (character) =>
		character === '\u2028' ? '\\u2028' : '\\u2029'
	);
}

function pathSpecifier(applicationRoot: string, configured: string): string {
	if (!configured.startsWith('.')) return configured;
	return path.resolve(applicationRoot, configured).replaceAll('\\', '/');
}
import type { AnyComponentFunction, ExactComponentAuthorizationIdentity } from '@exactjs/core';
import type { ExactHydrationRegistration } from '@exactjs/hydrate';

/** Public shape exported by every independently loadable eXact remote entry. */
export type ExactRemoteModule = {
	buildKey: string;
	componentAuthorization?: ExactComponentAuthorizationIdentity;
	root: string;
	component: AnyComponentFunction;
	registration: ExactHydrationRegistration;
};

/** Inputs used to generate one canonical remote entry module. */
export type ExactRemoteEntryModuleOptions = {
	buildKey: string;
	componentAuthorization?: ExactComponentAuthorizationIdentity;
	root: string;
	componentImport: string;
	registrationImport: string;
};

import {
	assertOnlyKeys,
	assertPackageName,
	assertPublicPackageSubpath,
	dependencyRange,
	matchesPackageSelectors,
	optionalRecord,
	readSelectors,
	requiredRecord,
	requiredString
} from './validation.js';
import {
	exactPluginApiPackage,
	exactPluginForwardingSchemaVersion,
	exactPluginSchemaVersion,
	type ExactPackageManifest,
	type ExactPackageParticipation,
	type ExactPluginConfigurationDeclaration,
	type ExactPluginDeclaration,
	type ExactPluginForwardDeclaration,
	type ExactPluginForwardingDeclaration
} from './contracts.js';

/** Reads and validates all eXact participation declared by a package manifest. */
export function readExactPackageParticipation(
	manifest: ExactPackageManifest,
	label = packageLabel(manifest)
): ExactPackageParticipation {
	const exact = optionalRecord(manifest.exact, `${label}.exact`);
	if (!exact) return Object.freeze({ configuration: Object.freeze({}) });
	const plugin = readPlugin(exact.plugin, label);
	const forwarding = readForwarding(exact.pluginForwarding, label);
	const configuration = readConfiguration(exact.pluginConfiguration, label);
	return Object.freeze({ plugin, forwarding, configuration });
}

/** Performs the package directly depends on plugin api domain operation. */
export function packageDirectlyDependsOnPluginApi(manifest: ExactPackageManifest): boolean {
	return (
		dependencyRange(manifest.dependencies, exactPluginApiPackage) !== undefined ||
		dependencyRange(manifest.optionalDependencies, exactPluginApiPackage) !== undefined
	);
}

function readPlugin(value: unknown, label: string): ExactPluginDeclaration | undefined {
	const record = optionalRecord(value, `${label}.exact.plugin`);
	if (!record) return undefined;
	assertOnlyKeys(
		record,
		['schemaVersion', 'protocolVersion', 'configKey', 'entries'],
		`${label}.exact.plugin`
	);
	if (record.schemaVersion !== exactPluginSchemaVersion) {
		throw new Error(`${label}.exact.plugin.schemaVersion must be ${exactPluginSchemaVersion}`);
	}
	const protocolVersion = requiredString(
		record.protocolVersion,
		`${label}.exact.plugin.protocolVersion`
	);
	const configKey = requiredString(record.configKey, `${label}.exact.plugin.configKey`);
	if (!/^[$A-Z_a-z][$\w]*$/.test(configKey))
		throw new Error(`${label}.exact.plugin.configKey must be an identifier`);
	const entriesRecord = requiredRecord(record.entries, `${label}.exact.plugin.entries`);
	assertOnlyKeys(
		entriesRecord,
		['config', 'configTypes', 'compiler', 'server', 'render', 'client', 'testing'],
		`${label}.exact.plugin.entries`
	);
	const entries: Record<string, string> = {};
	for (const [key, raw] of Object.entries(entriesRecord)) {
		const subpath = requiredString(raw, `${label}.exact.plugin.entries.${key}`);
		assertPublicPackageSubpath(subpath, `${label}.exact.plugin.entries.${key}`);
		entries[key] = subpath;
	}
	return Object.freeze({
		schemaVersion: exactPluginSchemaVersion,
		protocolVersion,
		configKey,
		entries: Object.freeze(entries)
	});
}

function readForwarding(
	value: unknown,
	label: string
): ExactPluginForwardingDeclaration | undefined {
	const record = optionalRecord(value, `${label}.exact.pluginForwarding`);
	if (!record) return undefined;
	assertOnlyKeys(record, ['schemaVersion', 'include', 'ignore'], `${label}.exact.pluginForwarding`);
	if (record.schemaVersion !== exactPluginForwardingSchemaVersion) {
		throw new Error(
			`${label}.exact.pluginForwarding.schemaVersion must be ${exactPluginForwardingSchemaVersion}`
		);
	}
	const includeRecord = requiredRecord(record.include, `${label}.exact.pluginForwarding.include`);
	const include: Record<string, ExactPluginForwardDeclaration> = {};
	for (const [name, raw] of Object.entries(includeRecord)) {
		assertPackageName(name, `${label} forwarded package`);
		const declaration = requiredRecord(raw, `${label} forwarding declaration for ${name}`);
		assertOnlyKeys(declaration, ['required'], `${label} forwarding declaration for ${name}`);
		if (declaration.required !== undefined && typeof declaration.required !== 'boolean') {
			throw new Error(`${label} forwarding declaration for ${name}.required must be boolean`);
		}
		include[name] = Object.freeze({ required: declaration.required });
	}
	const ignore = readSelectors(record.ignore, `${label}.exact.pluginForwarding.ignore`);
	for (const name of Object.keys(include)) {
		if (matchesPackageSelectors(name, ignore))
			throw new Error(`${label} cannot include and ignore ${name}`);
	}
	return Object.freeze({
		schemaVersion: exactPluginForwardingSchemaVersion,
		include: Object.freeze(include),
		ignore
	});
}

function readConfiguration(
	value: unknown,
	label: string
): Readonly<Record<string, ExactPluginConfigurationDeclaration>> {
	const record = optionalRecord(value, `${label}.exact.pluginConfiguration`);
	if (!record) return Object.freeze({});
	const result: Record<string, ExactPluginConfigurationDeclaration> = {};
	for (const [name, raw] of Object.entries(record)) {
		assertPackageName(name, `${label} configured plugin`);
		const declaration = requiredRecord(raw, `${label} configuration for ${name}`);
		assertOnlyKeys(
			declaration,
			['version', 'subpath', 'export'],
			`${label} configuration for ${name}`
		);
		const subpath = requiredString(
			declaration.subpath,
			`${label} configuration for ${name}.subpath`
		);
		assertPublicPackageSubpath(subpath, `${label} configuration for ${name}.subpath`);
		const exportName = requiredString(
			declaration.export,
			`${label} configuration for ${name}.export`
		);
		if (exportName !== 'default' && !/^[$A-Z_a-z][$\w]*$/.test(exportName)) {
			throw new Error(`${label} configuration for ${name}.export must be an export name`);
		}
		result[name] = Object.freeze({
			...(declaration.version === undefined
				? {}
				: {
						version: requiredString(
							declaration.version,
							`${label} configuration for ${name}.version`
						)
					}),
			subpath,
			export: exportName
		});
	}
	return Object.freeze(result);
}

function packageLabel(manifest: ExactPackageManifest): string {
	return typeof manifest.name === 'string' && manifest.name ? manifest.name : 'package.json';
}

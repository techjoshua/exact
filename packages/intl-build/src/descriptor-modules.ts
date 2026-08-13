import type { IntlClientRequirement, IntlRuntimeDescriptorV1 } from '@exactjs/intl';
import { validateIntlCatalog } from '@exactjs/intl/internal';

const intlModulePrefix = 'virtual:exact-intl/descriptor/';
const resolvedIntlModulePrefix = `\0${intlModulePrefix}`;

/** Build-owned descriptor companion retained so catalogs can relink without source compilation. */
export type ExactIntlDescriptorModule = Readonly<{
	code: string;
	companionCode: string;
	descriptors: readonly IntlRuntimeDescriptorV1[];
	generation: number;
	filename: string;
	clientRequirements: readonly IntlClientRequirement[];
}>;

/** Creates the deterministic public virtual request for one analyzed source module. */
export function exactIntlDescriptorModuleId(filename: string): string {
	return `${intlModulePrefix}${encodeURIComponent(filename.replaceAll('\\', '/'))}`;
}

/** Resolves an intl descriptor virtual request to its Rollup-private identity. */
export function resolveExactIntlDescriptorModule(source: string): string | undefined {
	return source.startsWith(intlModulePrefix) ? `\0${source}` : undefined;
}

/** Converts a public descriptor request to the key retained by the Vite plugin. */
export function resolvedExactIntlDescriptorModule(source: string): string {
	return source.startsWith(resolvedIntlModulePrefix) ? source : `\0${source}`;
}

/** Projects configured catalogs onto one component-source companion. */
export function projectExactIntlCatalogs(
	inputs: readonly unknown[] | undefined,
	descriptors: readonly IntlRuntimeDescriptorV1[]
): readonly unknown[] {
	if (!inputs?.length || descriptors.length === 0) return [];
	const keys = new Set(descriptors.map((descriptor) => descriptor.key));
	const output: unknown[] = [];
	for (const input of inputs) {
		if (typeof input !== 'object' || input === null || Array.isArray(input)) continue;
		const record = input as Record<string, unknown>;
		if (
			typeof record.messages !== 'object' ||
			record.messages === null ||
			Array.isArray(record.messages)
		)
			continue;
		const projected = Object.fromEntries(
			Object.entries(record.messages as Record<string, unknown>).filter(([key]) => keys.has(key))
		);
		if (Object.keys(projected).length === 0) continue;
		output.push(validateIntlCatalog({ ...record, messages: projected }, descriptors));
	}
	return Object.freeze(output);
}

/** Rebuilds one virtual companion for a new catalog generation without reanalyzing source. */
export function relinkExactIntlDescriptorModule(
	moduleId: string,
	companionCode: string,
	descriptors: readonly IntlRuntimeDescriptorV1[],
	catalogs: readonly unknown[] | undefined,
	generation: number,
	filename: string,
	clientRequirements: readonly IntlClientRequirement[] = [],
	clientBootstrap = ''
): ExactIntlDescriptorModule {
	const generatedCompanion = companionCode.replace(
		/export const generation = \d+;/u,
		`export const generation = ${generation};`
	);
	const projected = projectExactIntlCatalogs(catalogs, descriptors);
	return Object.freeze({
		code: `${clientBootstrap}import { registerIntlArtifacts as __exactRegisterIntlArtifacts } from "@exactjs/intl/internal";\n${generatedCompanion}export const clientRequirements = Object.freeze(${JSON.stringify(clientRequirements)});\nexport const catalogs = Object.freeze(${JSON.stringify(projected)});\n__exactRegisterIntlArtifacts(${JSON.stringify(moduleId)}, generation, descriptors, catalogs);\n`,
		companionCode,
		descriptors,
		generation,
		filename,
		clientRequirements: Object.freeze([...clientRequirements])
	});
}

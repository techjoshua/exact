import type {
	ExactCompilerDirective,
	ExactJsonValue,
	ExactPreparedCompilerRegistry
} from '@exactjs/plugin-api';
import type { TransformTarget } from './types.js';
import type { ExactModuleAnalysis } from './contracts/module-analysis.js';

const maxPluginDataBytes = 256 * 1024;
const maxPluginDataDepth = 32;
const maxPluginDataNodes = 10_000;

/** Applies a compiler plugins to the owned runtime state. */
export function applyCompilerPlugins(
	source: string,
	filename: string,
	target: TransformTarget,
	registry: ExactPreparedCompilerRegistry | undefined
): Pick<ExactModuleAnalysis, 'pluginRegistry' | 'pluginData' | 'diagnostics'> {
	const directives = collectPluginDirectives(source);
	const byNamespace = new Map(
		Object.values(registry?.plugins ?? {}).flatMap((plugin) =>
			plugin.extension ? [[plugin.extension.namespace, plugin] as const] : []
		)
	);
	for (const directive of directives) {
		const plugin = byNamespace.get(directive.namespace);
		if (!plugin) {
			throw new Error(`${filename}: unknown @exact directive namespace '${directive.namespace}'`);
		}
		const supported = plugin.extension?.directives ?? [];
		if (!supported.includes(directive.name)) {
			throw new Error(
				`${filename}: unknown @exact ${directive.namespace}.${directive.name} directive`
			);
		}
	}
	const diagnostics: string[] = [];
	const pluginData: Record<string, ExactJsonValue> = {};
	for (const plugin of Object.values(registry?.plugins ?? {}).sort((left, right) =>
		left.packageName.localeCompare(right.packageName)
	)) {
		const extension = plugin.extension;
		if (!extension?.analyzeModule) continue;
		if (extension.include && !matches(extension.include, filename)) continue;
		const ownedDirectives = directives.filter(
			(directive) => directive.namespace === extension.namespace
		);
		const contribution = extension.analyzeModule(
			Object.freeze({
				id: filename,
				source,
				target,
				directives: Object.freeze(ownedDirectives)
			})
		);
		for (const diagnostic of contribution?.diagnostics ?? []) {
			diagnostics.push(
				`${diagnostic.severity}: [${plugin.packageName}/${diagnostic.code}] ${diagnostic.message}`
			);
		}
		if (contribution?.analysisData !== undefined) {
			assertBoundedJson(contribution.analysisData, `${plugin.packageName} analysis data`);
			extension.validateAnalysisData?.(contribution.analysisData);
			pluginData[plugin.packageName] = contribution.analysisData;
		}
	}
	if (!registry || !Object.keys(registry.plugins).length) return { diagnostics };
	return {
		pluginRegistry: {
			fingerprint: registry.fingerprint,
			plugins: Object.fromEntries(
				Object.values(registry.plugins)
					.sort((left, right) => left.packageName.localeCompare(right.packageName))
					.map((plugin) => [
						plugin.packageName,
						{
							version: plugin.version,
							protocolVersion: plugin.protocolVersion,
							required: plugin.required,
							compilerConfigKey: plugin.cacheKey
						}
					])
			)
		},
		pluginData,
		diagnostics
	};
}

/** Collects plugin directives in deterministic order. */
export function collectPluginDirectives(source: string): ExactCompilerDirective[] {
	const result: ExactCompilerDirective[] = [];
	const marker =
		/@exact\s+([A-Za-z_$][\w$-]*)\.([A-Za-z_$][\w$-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z_$][\w$]*)))?/g;
	for (let match = marker.exec(source); match; match = marker.exec(source)) {
		result.push(
			Object.freeze({
				namespace: match[1]!,
				name: match[2]!,
				...((match[3] ?? match[4] ?? match[5])
					? { argument: match[3] ?? match[4] ?? match[5] }
					: {}),
				start: match.index,
				length: match[0].length
			})
		);
	}
	return result;
}

function assertBoundedJson(value: ExactJsonValue, label: string): void {
	let nodes = 0;
	const pending: Array<{ value: ExactJsonValue; depth: number }> = [{ value, depth: 0 }];
	while (pending.length) {
		const current = pending.pop()!;
		if (++nodes > maxPluginDataNodes || current.depth > maxPluginDataDepth) {
			throw new Error(`${label} exceeds compiler analysis resource limits`);
		}
		if (current.value && typeof current.value === 'object') {
			for (const child of Object.values(current.value))
				pending.push({ value: child, depth: current.depth + 1 });
		}
	}
	if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxPluginDataBytes) {
		throw new Error(`${label} exceeds compiler analysis byte limit`);
	}
}

function matches(pattern: RegExp, value: string): boolean {
	pattern.lastIndex = 0;
	return pattern.test(value);
}

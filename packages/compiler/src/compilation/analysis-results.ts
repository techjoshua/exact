import { type BoundModule } from '@exact/expressions';
import type { ExactCompilerSession } from '../expression/project.js';
import { expressionModuleFor } from '../expression/session.js';
import { parseExactCompilerManifest } from '../manifest-parse.js';
import { validateImportedPluginRegistries } from '../plugins.js';
import { preprocessPropPunning } from '../preprocess.js';
import { buildExpressionSemanticGraph } from '../semantic.js';
import type {
	ExactCompilerManifest,
	ExactRawHtmlCapabilityIR,
	ExactSemanticGraphIR,
	TransformOptions
} from '../types.js';

export function importedSecretRequirementDiagnostics(
	imported: readonly ExactCompilerManifest[],
	options: TransformOptions
): string[] {
	if (options.packageType === 'library') return [];
	const allowPackages = options.capabilityPolicy?.secrets?.allowPackages ?? [];
	const diagnostics = new Set<string>();
	for (const manifest of imported) {
		for (const use of manifest.policy.secretConsumers) {
			if (use.consumer.package === options.packageName) continue;
			if (use.authorization === 'denied') {
				diagnostics.add(
					`error: dependency secret use at ${use.source}:${use.line}:${use.column} is denied: ${use.reason ?? 'unresolved policy violation'}`
				);
				continue;
			}
			if (use.target === 'client') {
				diagnostics.add(
					`error: dependency secret use at ${use.source}:${use.line}:${use.column} is retained in a client artifact`
				);
				continue;
			}
			if (!allowPackages.includes(use.consumer.package))
				diagnostics.add(
					`error: dependency ${use.consumer.package} consumes a secret at ${use.source}:${use.line}:${use.column} but is not in secrets.allowPackages`
				);
		}
	}
	return [...diagnostics].sort();
}

export function rawHtmlCapabilityDiagnostics(
	local: readonly ExactRawHtmlCapabilityIR[],
	imported: readonly ExactCompilerManifest[],
	options: TransformOptions
): string[] {
	if (options.packageType === 'library') return [];
	const dependencyRequirements = imported.flatMap((manifest) =>
		(manifest.requiredCapabilities?.rawHtml ?? []).map((requirement) => ({
			manifest,
			requirement
		}))
	);
	if (!local.length && !dependencyRequirements.length) return [];

	const policy = options.capabilityPolicy?.unsafeHtml;
	const diagnostics: string[] = [];
	if (!policy?.enabled) {
		diagnostics.push(
			'error: unsafeHtml capability is used but the application has not explicitly enabled it'
		);
	}
	const grants = new Set(policy?.grants ?? []);
	for (const { manifest, requirement } of dependencyRequirements) {
		if (manifest.packageName === options.packageName) continue;
		if (!manifest.packageName) {
			diagnostics.push(
				`error: unsafeHtml requirement at ${requirement.source}:${requirement.line}:${requirement.column} has no package identity and cannot be granted`
			);
		} else if (!grants.has(manifest.packageName)) {
			diagnostics.push(
				`error: dependency ${manifest.packageName} uses unsafeHtml at ${requirement.source}:${requirement.line}:${requirement.column} without an application grant`
			);
		}
	}
	return diagnostics;
}

export function effectDiagnosticPath(
	initializer: ExactCompilerManifest['callables'][number],
	effect: 'mixed' | 'unknown'
): string {
	if (effect === 'unknown') {
		return (
			initializer.effectSources
				.find((source) => source.environment === 'unknown')
				?.path.join(' → ') ?? initializer.name
		);
	}
	const browser = initializer.effectSources
		.find((source) => source.environment === 'browser')
		?.path.join(' → ');
	const server = initializer.effectSources
		.find((source) => source.environment === 'server')
		?.path.join(' → ');
	return browser && server ? `${browser} ↔ ${server}` : (browser ?? server ?? initializer.name);
}

export function validatedImportedManifests(
	manifests: readonly ExactCompilerManifest[] | undefined,
	registry: TransformOptions['pluginRegistry']
): ExactCompilerManifest[] {
	const parsed = (manifests ?? []).map((manifest, index) =>
		parseExactCompilerManifest(manifest, `imported compiler manifest ${index + 1}`)
	);
	validateImportedPluginRegistries(parsed, registry);
	return parsed;
}

export function assertUniqueIds(label: string, ids: readonly string[]): void {
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) throw new Error(`Duplicate eXact ${label} id generated: ${id}`);
		seen.add(id);
	}
}

export function portableSemanticGraph(
	graph: ExactSemanticGraphIR,
	boundFilename: string,
	declaredFilename: string
): ExactSemanticGraphIR {
	const bound = boundFilename.replace(/\\/g, '/').toLowerCase();
	const declared = declaredFilename.replace(/\\/g, '/').toLowerCase();
	const rewrite = (id: string | undefined): string | undefined =>
		id?.startsWith(bound) ? `${declared}${id.slice(bound.length)}` : id;
	return {
		scopes: graph.scopes.map((scope) => ({
			...scope,
			id: rewrite(scope.id)!,
			...(scope.parentId ? { parentId: rewrite(scope.parentId)! } : {})
		})),
		declarations: graph.declarations.map((declaration) => ({
			...declaration,
			id: rewrite(declaration.id)!,
			scopeId: rewrite(declaration.scopeId)!
		})),
		references: graph.references.map((reference) => ({
			...reference,
			scopeId: rewrite(reference.scopeId)!,
			...(reference.declarationId ? { declarationId: rewrite(reference.declarationId)! } : {})
		})),
		exports: graph.exports.map((exported) => ({ ...exported }))
	};
}

/** Builds the semantic graph used for reference/declaration tracing diagnostics and tests. */
export function analyzeSemanticGraph(
	source: string,
	options: Pick<TransformOptions, 'filename' | 'root' | 'session'> = {}
): ExactSemanticGraphIR {
	const normalized = preprocessPropPunning(source);
	const filename = options.filename ?? 'input.tsx';
	return buildExpressionSemanticGraph(
		sessionExpressionModule(options.session, filename, normalized, { root: options.root })
	);
}

export function sessionExpressionModule(
	session: ExactCompilerSession | undefined,
	filename: string,
	source: string,
	options: Parameters<typeof expressionModuleFor>[2]
): BoundModule {
	return session
		? session.expressionModuleFor(filename, source, options)
		: expressionModuleFor(filename, source, options);
}

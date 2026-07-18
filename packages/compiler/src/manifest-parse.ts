import type {
  ExactArtifactManifest,
  ExactCallableSummaryIR,
  ExactCompilerManifest,
  ExactSemanticDeclarationIR,
  ExactSemanticExportIR,
  ExactSemanticGraphIR,
  ExactPolicyManifestIR,
  ExactSemanticReferenceIR,
  ExactSemanticScopeIR
} from "./types.js";
import { exactCompilerManifestVersion } from "./versions.js";

/** Parses and validates a compiler manifest loaded from JSON. */
export function parseExactCompilerManifest(value: unknown, source = "manifest", kind = "compiler"): ExactCompilerManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Malformed eXact ${kind} manifest in ${source}`);
  }
  const manifest = value as Partial<ExactCompilerManifest> & { version?: unknown };
  if (manifest.version !== exactCompilerManifestVersion && manifest.version !== 2) {
    throw new Error(`Unsupported eXact ${kind} manifest version in ${source}: ${String(manifest.version)}`);
  }
  if (typeof manifest.filename !== "string"
    || !Array.isArray(manifest.dependencies) || !manifest.dependencies.every(dependency => typeof dependency === "string")
    || !Array.isArray(manifest.assets) || !manifest.assets.every(isExactAssetDependency)
    || !Array.isArray(manifest.components)
    || !Array.isArray(manifest.exports)
    || !Array.isArray(manifest.symbols)
    || !Array.isArray(manifest.boundaries)
    || !Array.isArray(manifest.callables)
    || !isExactPolicyManifest(manifest.policy)
    || !manifest.serverActions
    || typeof manifest.serverActions !== "object"
    || Array.isArray(manifest.serverActions)
    || !Array.isArray(manifest.diagnostics)) {
    throw new Error(`Malformed eXact ${kind} manifest in ${source}`);
  }
  if (manifest.version !== exactCompilerManifestVersion) {
    throw new Error(`Unsupported eXact ${kind} manifest version in ${source}: ${String(manifest.version)}`);
  }
  if (manifest.semanticGraph !== undefined && !isExactSemanticGraph(manifest.semanticGraph)) {
    throw new Error(`Malformed eXact ${kind} semantic graph in ${source}`);
  }
  if (!manifest.callables!.every(isExactCallableSummary)) {
    throw new Error(`Malformed eXact ${kind} callable summaries in ${source}`);
  }
  if ((manifest.packageName !== undefined && (typeof manifest.packageName !== "string" || !manifest.packageName))
    || (manifest.requiredCapabilities !== undefined && !isExactCapabilityRequirements(manifest.requiredCapabilities))) {
    throw new Error(`Malformed eXact ${kind} capability requirements in ${source}`);
  }
  if (new Set(manifest.dependencies).size !== manifest.dependencies.length
    || manifest.dependencies.some(dependency => dependency.length === 0 || /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(dependency))) {
    throw new Error(`Malformed eXact ${kind} dependencies in ${source}`);
  }
  const callableIds = new Set(manifest.callables!.map(callable => callable.id));
  if (callableIds.size !== manifest.callables!.length
    || manifest.callables!.some(callable => new Set(callable.calls.map(edge => edge.id)).size !== callable.calls.length)
    || manifest.callables!.some(callable => callable.calls.some(edge => edge.targetId !== undefined && !callableIds.has(edge.targetId)))) {
    throw new Error(`Malformed eXact ${kind} callable graph in ${source}`);
  }
  const policySubjectIds = new Set(manifest.policy!.subjects.map(subject => subject.id));
  const policySourceIds = new Set([
    ...policySubjectIds,
    ...callableIds,
    ...manifest.components.map(component => component.id),
    ...manifest.components.flatMap(component => component.tasks.map(task => task.id))
  ]);
  if (policySubjectIds.size !== manifest.policy!.subjects.length
    || new Set(manifest.policy!.flows.map(flow => flow.id)).size !== manifest.policy!.flows.length
    || manifest.policy!.flows.some(flow => flow.from.some(id => !policySourceIds.has(id)))) {
    throw new Error(`Malformed eXact ${kind} policy graph in ${source}`);
  }
  validatePluginEnvelope(manifest, source, kind);
  return manifest as ExactCompilerManifest;
}

function isExactPolicyManifest(value: unknown): value is ExactPolicyManifestIR {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Partial<ExactPolicyManifestIR>;
  return policy.version === 1
    && Array.isArray(policy.subjects) && policy.subjects.every(subject => {
      if (!subject || typeof subject !== "object" || Array.isArray(subject)) return false;
      const record = subject as Record<string, unknown>;
      return typeof record.id === "string" && record.id.length > 0
        && ["declaration", "field", "parameter", "return", "state", "context"].includes(String(record.kind))
        && typeof record.name === "string" && record.name.length > 0
        && (record.path === undefined || typeof record.path === "string")
        && (record.componentId === undefined || typeof record.componentId === "string")
        && (record.callableId === undefined || typeof record.callableId === "string")
        && (record.parameterIndex === undefined || Number.isInteger(record.parameterIndex) && (record.parameterIndex as number) >= 0)
        && isExactDataPolicy(record.policy)
        && ["annotation", "context-option", "inference", "import"].includes(String(record.source));
    })
    && Array.isArray(policy.flows) && policy.flows.every(flow => {
      if (!flow || typeof flow !== "object" || Array.isArray(flow)) return false;
      const record = flow as Record<string, unknown>;
      return typeof record.id === "string" && record.id.length > 0
        && ["propagation", "receipt", "projection", "transfer"].includes(String(record.kind))
        && Array.isArray(record.from) && record.from.every(source => typeof source === "string")
        && typeof record.to === "string" && record.to.length > 0
        && isExactDataPolicy(record.policy)
        && (record.boundary === undefined || ["client-island", "hydration", "context", "call", "state"].includes(String(record.boundary)))
        && typeof record.authorized === "boolean"
        && (record.reason === undefined || typeof record.reason === "string");
    });
}

function isExactDataPolicy(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  return ["server", "client", "isomorphic"].includes(String(policy.residency))
    && typeof policy.secret === "boolean"
    && (!policy.secret || policy.residency === "server");
}

function isExactCapabilityRequirements(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.rawHtml)) return false;
  return record.rawHtml.every(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const requirement = raw as Record<string, unknown>;
    return typeof requirement.source === "string"
      && Number.isInteger(requirement.line) && (requirement.line as number) > 0
      && Number.isInteger(requirement.column) && (requirement.column as number) > 0
      && typeof requirement.symbol === "string" && requirement.symbol.length > 0
      && Array.isArray(requirement.targets)
      && requirement.targets.length > 0
      && requirement.targets.every(target => target === "client" || target === "server")
      && new Set(requirement.targets).size === requirement.targets.length;
  });
}

function isExactAssetDependency(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const asset = value as Record<string, unknown>;
  return typeof asset.specifier === "string" && asset.specifier.length > 0
    && ["style", "image", "video", "audio", "font", "document", "data", "worker", "other"].includes(String(asset.kind))
    && ["side-effect", "url", "raw", "inline", "module", "worker"].includes(String(asset.importMode))
    && ["client", "server", "both"].includes(String(asset.evaluationTarget))
    && ["client", "server", "both", "embedded"].includes(String(asset.deliveryTarget));
}

function validatePluginEnvelope(
  manifest: Partial<ExactCompilerManifest>,
  source: string,
  kind: string
): void {
  if (manifest.pluginRegistry === undefined && manifest.pluginData === undefined) return;
  const registry = manifest.pluginRegistry;
  if (!registry || typeof registry !== "object" || typeof registry.fingerprint !== "string"
    || !registry.plugins || typeof registry.plugins !== "object" || Array.isArray(registry.plugins)) {
    throw new Error(`Malformed eXact ${kind} plugin registry in ${source}`);
  }
  for (const [name, raw] of Object.entries(registry.plugins)) {
    if (!name || !raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Malformed eXact ${kind} plugin registry in ${source}`);
    }
    const metadata = raw as Record<string, unknown>;
    if (typeof metadata.version !== "string"
      || typeof metadata.protocolVersion !== "string"
      || typeof metadata.required !== "boolean"
      || !isJsonSafe(metadata.compilerConfigKey)) {
      throw new Error(`Malformed eXact ${kind} plugin registry in ${source}`);
    }
  }
  if (manifest.pluginData !== undefined) {
    if (!manifest.pluginData || typeof manifest.pluginData !== "object" || Array.isArray(manifest.pluginData)) {
      throw new Error(`Malformed eXact ${kind} plugin data in ${source}`);
    }
    for (const [name, value] of Object.entries(manifest.pluginData)) {
      if (!(name in registry.plugins) || !isJsonSafe(value)) {
        throw new Error(`Malformed eXact ${kind} plugin data in ${source}`);
      }
    }
  }
}

function isJsonSafe(value: unknown): boolean {
  const seen = new Set<object>();
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++nodes > 10_000 || current.depth > 32) return false;
    const item = current.value;
    if (item === null || typeof item === "string" || typeof item === "boolean") continue;
    if (typeof item === "number" && Number.isFinite(item)) continue;
    if (!item || typeof item !== "object" || seen.has(item)) return false;
    seen.add(item);
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) return false;
    for (const child of Object.values(item)) pending.push({ value: child, depth: current.depth + 1 });
  }
  return true;
}

function isExactCallableSummary(value: unknown): value is ExactCallableSummaryIR {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const summary = value as Partial<ExactCallableSummaryIR>;
  const effects = new Set(["neutral", "browser", "server", "mixed", "unknown"]);
  return typeof summary.id === "string"
    && typeof summary.name === "string"
    && ["function", "method", "component", "task", "initializer", "module-initializer"].includes(summary.kind ?? "")
    && Array.isArray(summary.exportNames) && summary.exportNames.every(name => typeof name === "string")
    && effects.has(summary.directEffect ?? "")
    && effects.has(summary.effect ?? "")
    && Array.isArray(summary.directEffectSources) && summary.directEffectSources.every(isExactEffectSource)
    && Array.isArray(summary.effectSources) && summary.effectSources.every(isExactEffectSource)
    && Array.isArray(summary.calls) && summary.calls.every(isExactCallEdge)
    && Array.isArray(summary.artifactTargets) && summary.artifactTargets.every(target => target === "client" || target === "server")
    && new Set(summary.artifactTargets).size === summary.artifactTargets.length
    && Array.isArray(summary.stateReads) && summary.stateReads.every(isExactStateEffect)
    && Array.isArray(summary.stateWrites) && summary.stateWrites.every(isExactStateEffect)
    && Array.isArray(summary.contexts) && summary.contexts.every(isExactContextEffect);
}

function isExactStateEffect(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const effect = value as Record<string, unknown>;
  const receiver = effect.receiver as Record<string, unknown> | undefined;
  return typeof effect.path === "string" && (effect.kind === "read" || effect.kind === "write") && ["exact", "broad", "unknown"].includes(String(effect.confidence))
    && (receiver === undefined || receiver.kind === "component" || receiver.kind === "unknown" || receiver.kind === "parameter" && Number.isInteger(receiver.index) && (receiver.index as number) >= 0);
}

function isExactContextEffect(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const effect = value as Record<string, unknown>;
  return typeof effect.token === "string" && (effect.kind === "read" || effect.kind === "write") && (effect.confidence === "exact" || effect.confidence === "unknown");
}

function isExactEffectSource(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return (source.environment === "browser" || source.environment === "server" || source.environment === "unknown")
    && typeof source.description === "string"
    && Array.isArray(source.path) && source.path.every(part => typeof part === "string");
}

function isExactCallEdge(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const edge = value as Record<string, unknown>;
  return typeof edge.id === "string"
    && typeof edge.name === "string"
    && typeof edge.resolved === "boolean"
    && (edge.targetId === undefined || typeof edge.targetId === "string")
    && (edge.moduleSpecifier === undefined || typeof edge.moduleSpecifier === "string")
    && (edge.exportName === undefined || typeof edge.exportName === "string")
    && (edge.receiverBindings === undefined || Array.isArray(edge.receiverBindings) && edge.receiverBindings.every(binding => {
      if (!binding || typeof binding !== "object" || Array.isArray(binding)) return false;
      const record = binding as Record<string, unknown>;
      return Number.isInteger(record.parameterIndex) && (record.parameterIndex as number) >= 0
        && (record.source === "component" || record.source === "unknown" || record.source === "parameter" && Number.isInteger(record.sourceParameterIndex) && (record.sourceParameterIndex as number) >= 0);
    }));
}

/** Returns whether a value has the artifact metadata shape embedded in compiler manifests. */
export function isExactArtifactManifest(value: unknown): value is ExactArtifactManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.source === "string"
    && typeof record.client === "string"
    && typeof record.server === "string"
    && typeof record.manifest === "string"
    && Array.isArray(record.exports)
    && Array.isArray(record.symbols)
    && Array.isArray(record.boundaries);
}

function isExactSemanticGraph(value: unknown): value is ExactSemanticGraphIR {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const graph = value as Partial<ExactSemanticGraphIR>;
  return Array.isArray(graph.scopes)
    && graph.scopes.every(isExactSemanticScope)
    && Array.isArray(graph.declarations)
    && graph.declarations.every(isExactSemanticDeclaration)
    && Array.isArray(graph.references)
    && graph.references.every(isExactSemanticReference)
    && Array.isArray(graph.exports)
    && graph.exports.every(isExactSemanticExport);
}

function isExactSemanticScope(value: unknown): value is ExactSemanticScopeIR {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const scope = value as Partial<ExactSemanticScopeIR>;
  return typeof scope.id === "string"
    && (scope.parentId === undefined || typeof scope.parentId === "string")
    && (scope.kind === "module" || scope.kind === "function" || scope.kind === "block")
    && typeof scope.nodeKind === "string";
}

function isExactSemanticDeclaration(value: unknown): value is ExactSemanticDeclarationIR {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const declaration = value as Partial<ExactSemanticDeclarationIR>;
  return typeof declaration.id === "string"
    && typeof declaration.name === "string"
    && typeof declaration.scopeId === "string"
    && typeof declaration.kind === "string"
    && typeof declaration.nodeStart === "number"
    && typeof declaration.nodeEnd === "number";
}

function isExactSemanticReference(value: unknown): value is ExactSemanticReferenceIR {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reference = value as Partial<ExactSemanticReferenceIR>;
  return typeof reference.name === "string"
    && typeof reference.scopeId === "string"
    && typeof reference.source === "string"
    && typeof reference.nodeStart === "number"
    && typeof reference.nodeEnd === "number";
}

function isExactSemanticExport(value: unknown): value is ExactSemanticExportIR {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const exported = value as Partial<ExactSemanticExportIR>;
  return typeof exported.exportedName === "string";
}

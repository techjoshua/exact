import type {
  ExactArtifactManifest,
  ExactCompilerManifest,
  ExactSemanticDeclarationIR,
  ExactSemanticExportIR,
  ExactSemanticGraphIR,
  ExactSemanticReferenceIR,
  ExactSemanticScopeIR
} from "./types.js";
import { exactCompilerManifestVersion } from "./versions.js";

export function parseExactCompilerManifest(value: unknown, source = "manifest", kind = "compiler"): ExactCompilerManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Malformed eXact ${kind} manifest in ${source}`);
  }
  const manifest = value as Partial<ExactCompilerManifest> & { version?: unknown };
  if (manifest.version !== exactCompilerManifestVersion) {
    throw new Error(`Unsupported eXact ${kind} manifest version in ${source}: ${String(manifest.version)}`);
  }
  if (typeof manifest.filename !== "string"
    || !Array.isArray(manifest.components)
    || !Array.isArray(manifest.exports)
    || !Array.isArray(manifest.symbols)
    || !Array.isArray(manifest.boundaries)
    || !manifest.serverActions
    || typeof manifest.serverActions !== "object"
    || Array.isArray(manifest.serverActions)
    || !Array.isArray(manifest.diagnostics)) {
    throw new Error(`Malformed eXact ${kind} manifest in ${source}`);
  }
  if (manifest.semanticGraph !== undefined && !isExactSemanticGraph(manifest.semanticGraph)) {
    throw new Error(`Malformed eXact ${kind} semantic graph in ${source}`);
  }
  return manifest as ExactCompilerManifest;
}

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

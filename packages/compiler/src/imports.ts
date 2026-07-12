import path from "node:path";
import ts from "typescript";
import { slashPath } from "./paths.js";
import { buildSemanticGraph } from "./semantic.js";
import type {
  ExactCompilerManifest,
  ExactComponentIR,
  ExactExportIR,
  ExactImportedComponentIR,
  ExactSemanticGraphIR,
  ExactSemanticReferenceIR
} from "./types.js";

export function isServerOnlyReference(
  node: ts.Identifier,
  reference: ExactSemanticReferenceIR | undefined,
  serverOnlyImports: Set<string>
): boolean {
  if (!serverOnlyImports.has(node.text)) return false;
  return reference?.source === "import" && !reference.typeOnly && !!reference.moduleSpecifier && isServerOnlyModule(reference.moduleSpecifier);
}

export function collectImportedComponents(
  sourceFile: ts.SourceFile,
  manifests: readonly ExactCompilerManifest[],
  graph: ExactSemanticGraphIR = buildSemanticGraph(sourceFile)
): ExactImportedComponentIR[] {
  if (!manifests.length) return [];
  const bySource = new Map<string, ExactCompilerManifest[]>();
  for (const manifest of manifests) {
    const keys = manifestSourceKeys(manifest);
    for (const key of keys) {
      const entries = bySource.get(key) ?? [];
      entries.push(manifest);
      bySource.set(key, entries);
    }
  }

  const imported: ExactImportedComponentIR[] = [];
  const sourceDir = path.dirname(path.resolve(sourceFile.fileName));
  for (const declaration of graph.declarations) {
    if (declaration.kind !== "import" || declaration.typeOnly || !declaration.moduleSpecifier || !declaration.importedName) continue;
    const manifestsForImport = bySource.get(moduleSpecifierKey(declaration.moduleSpecifier, sourceDir));
    if (!manifestsForImport?.length) continue;
    if (declaration.importedName === "*") {
      const namespace = declaration.name;
      for (const manifest of manifestsForImport) {
        for (const exported of manifest.exports) {
          if (exported.kind !== "component") continue;
          const component = resolveImportedComponent([manifest], exported.name)?.component;
          const propertyName = exported.name;
          if (!propertyName) continue;
          imported.push({
            name: `${namespace}.${propertyName}`,
            boundaryName: component?.name ?? propertyName,
            placement: exported.placement,
            componentId: component?.id
          });
        }
      }
      continue;
    }

    const resolved = resolveImportedComponent(manifestsForImport, declaration.importedName);
    if (resolved) {
      imported.push({
        name: declaration.name,
        boundaryName: resolved.component?.name ?? declaration.importedName,
        placement: resolved.exported.placement,
        componentId: resolved.component?.id
      });
      continue;
    }
  }
  return imported;
}

function resolveImportedComponent(
  manifests: readonly ExactCompilerManifest[],
  exportedName: string
): { exported: ExactExportIR; component?: ExactComponentIR } | undefined {
  for (const manifest of manifests) {
    const exported = manifest.exports.find(item => item.name === exportedName && item.kind === "component");
    if (!exported) continue;
    if (exportedName === "default") {
      const defaultSymbol = manifest.symbols.find(symbol => symbol.role === "root" && symbol.exportName === "default" && symbol.componentId);
      return {
        exported,
        component: manifest.components.find(item => item.id === defaultSymbol?.componentId)
      };
    }
    return {
      exported,
      component: manifest.components.find(item => item.name === exportedName)
    };
  }
  return undefined;
}

function manifestSourceKeys(manifest: ExactCompilerManifest): string[] {
  const keys = new Set<string>();
  keys.add(moduleSpecifierKey(manifest.filename, process.cwd()));
  if (manifest.artifacts?.source) {
    keys.add(moduleSpecifierKey(manifest.artifacts.source, process.cwd()));
  }
  return [...keys];
}

function moduleSpecifierKey(specifier: string, baseDir: string): string {
  const resolved = specifier.startsWith(".")
    ? path.resolve(baseDir, specifier)
    : path.isAbsolute(specifier)
      ? path.resolve(specifier)
      : specifier;
  return slashPath(resolved)
    .replace(/\.exact\.(client|server)(\.[cm]?[jt]sx?)?$/i, "")
    .replace(/\.exact$/i, "")
    .replace(/\.[cm]?[jt]sx?$/i, "");
}

export function collectServerOnlyImports(sourceFile: ts.SourceFile, graph: ExactSemanticGraphIR = buildSemanticGraph(sourceFile)): Set<string> {
  return new Set(graph.declarations
    .filter(declaration => declaration.kind === "import" && !declaration.typeOnly && !!declaration.moduleSpecifier && isServerOnlyModule(declaration.moduleSpecifier))
    .map(declaration => declaration.name));
}

export function isServerOnlyImportDeclaration(statement: ts.Statement): boolean {
  return ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier)
    && isServerOnlyModule(statement.moduleSpecifier.text)
    && importDeclarationHasRuntimeBinding(statement);
}

function importDeclarationHasRuntimeBinding(statement: ts.ImportDeclaration): boolean {
  const clause = statement.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return true;
  return bindings.elements.some(element => !element.isTypeOnly);
}

export function isServerOnlyModule(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  return ["fs", "path", "crypto", "http", "https", "net", "tls", "child_process"].includes(specifier);
}

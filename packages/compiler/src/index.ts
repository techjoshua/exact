import ts from "typescript";
import { ExpressionProjectError, rewriteModule, rewriteModuleReferences, type BoundModule, type ModuleRewriteOptions } from "@exact/expressions";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  artifactGraphEntryFromCompileResult,
  createExactArtifactGraph,
  diffExactArtifactPlans,
  readExactArtifactManifestEntries
} from "./artifacts.js";
import { combinePlacements } from "./placement.js";
import { analyzeCallableEffects } from "./callable-effects.js";
import { expressionDependencyFiles, invalidateExpressionModule, type ExactCompilerSession } from "./expression-project.js";
import type {
  CompileArtifactPlanEntriesOptions,
  CompileArtifactsOptions,
  CompileArtifactsResult,
  CompileFileOptions,
  CompileFileResult,
  CompileProjectOptions,
  ExactArtifactDevState,
  ExactArtifactDevStateOptions,
  ExactArtifactDevStateUpdate,
  ExactArtifactPlan,
  ExactArtifactPlanEntry,
  ExactArtifactPlanOptions,
  ExactBoundaryIR,
  ExactCompilerManifest,
  ExactComponentIR,
  ExactExportIR,
  ExactImportedComponentIR,
  ExactPlacement,
  ExactSemanticGraphIR,
  ExactSymbolIR,
  TransformOptions,
  TransformResult,
  TransformTarget
} from "./types.js";
import {
  collectExpressionExportBindings
} from "./exports.js";
import {
  collectExpressionImportedComponents
} from "./imports.js";
import { generatedComponentName } from "./names.js";
import { parseExactCompilerManifest } from "./manifest-parse.js";
import {
  artifactPathsFor,
  collectInputFiles,
  commonRoot,
  manifestPathFor,
  outputPathFor,
  withArtifactMetadata
} from "./paths.js";
import { preprocessPropPunning } from "./preprocess.js";
import {
  createClientIslandRegistryEntries,
  createClientIslandRegistryModule,
  createExactHydrationRegistrationModule,
  createServerPartRegistryEntries,
  createServerPartRegistryModule
} from "./registry.js";
import {
  buildExpressionSemanticGraph
} from "./semantic.js";
import {
  createLineSourceMap,
  sourceMapPathFor,
  withSourceMapFile,
  withSourceMappingUrl
} from "./source-maps.js";
import {
  createClientIslandBoundaries,
  createClientIslandSymbols,
  createRootSymbols,
  createServerPartSymbols,
  createValueRootSymbols
} from "./symbols.js";
import { exactJsxTransformer } from "./jsx-transform.js";
import { exactCompilerManifestVersion } from "./versions.js";
import { expressionModuleFor } from "./expression-project.js";
import { buildExactProvenance } from "./provenance.js";
import { analyzeExpressionWrites } from "./expression-writes.js";
import { analyzeExpressionSafety } from "./expression-safety.js";
import { analyzeExpressionTasks } from "./expression-tasks.js";
import { analyzeExpressionJsx } from "./expression-jsx.js";
import { analyzeExpressionComponents } from "./expression-components.js";
import { analyzeExpressionDerived } from "./expression-derived.js";
import { createExpressionComponents, createExpressionGeneratedServerSlotBoundaries, createExpressionRenderEdges } from "./expression-components.js";
import { createExpressionComponentBoundaries } from "./expression-components.js";
import { analyzeExactAnnotations } from "./annotations.js";
import { applyCompilerPlugins, validateImportedPluginRegistries } from "./plugins.js";
import { analyzeModuleImports } from "./assets.js";

export type * from "./types.js";
export { preprocessPropPunning } from "./preprocess.js";
export { parseExactCompilerManifest } from "./manifest-parse.js";
export { generatedComponentName } from "./names.js";
export {
  createExactArtifactComponentEdges,
  createExactArtifactGraph,
  createExactArtifactRegistryModules,
  createPackageExportMap,
  diffExactArtifactPlans,
  exactExportConditions,
  readExactArtifactManifestEntries,
  resolveExactArtifactImport
} from "./artifacts.js";
export {
  createClientIslandRegistryEntries,
  createClientIslandRegistryModule,
  createExactHydrationRegistrationModule,
  createServerPartRegistryEntries,
  createServerPartRegistryModule
} from "./registry.js";
export { exactCompilerManifestVersion } from "./versions.js";
export { createLineSourceMap } from "./source-maps.js";
export {
  rewriteModuleReferences,
  type ModuleExportReplacement,
  type ModuleRewriteOptions,
  type ModuleRewriteResult
} from "./module-rewrite.js";
export {
  ExactCompilerSession,
  createCompilerSession,
  clearExpressionProjectCache,
  invalidateExpressionModule,
  type ExactCompilerInvalidation,
  type ExactCompilerSessionOptions,
  type ExactCompilerSessionStats
} from "./expression-project.js";
export {
  analyzeExpressionWrites,
  lowerExpressionWrites,
  type ExpressionWritePlan,
  type ExpressionWriteResult,
  type ExpressionWriteSite
} from "./expression-writes.js";
export {
  buildExactProvenance,
  type ExactProvenanceEntry,
  type ExactProvenanceGraph,
  type ExactReactiveCell,
  type ExactReactiveProvenance
} from "./provenance.js";

/** Analyzes generic dependencies and overlays eXact reactive provenance. */
export function analyzeReactiveProvenance(source: string, options: TransformOptions = {}) {
  const filename = options.filename ?? "input.tsx";
  return buildExactProvenance(sessionExpressionModule(options.session, filename, preprocessPropPunning(source), { root: options.root }));
}

/** Transforms eXact TSX/JSX source and returns only the generated code. */
export function transform(source: string, options: TransformOptions = {}): string {
  return transformSource(source, options).code;
}

/** Transforms eXact TSX/JSX source into code, source map metadata, and compiler manifest. */
export function transformSource(source: string, options: TransformOptions = {}): TransformResult {
  const normalized = preprocessPropPunning(source);
  const filename = options.filename ?? "input.tsx";
  const virtual = !path.isAbsolute(filename);
  const importedManifests = validatedImportedManifests(options.importedManifests, options.pluginRegistry);
  const target = options.target ?? "default";
  const expressionModule = sessionExpressionModule(options.session, filename, normalized, {
    root: options.root,
    virtual,
    diagnostics: options.generatedValidation === "semantic" ? "full" : "syntax"
  });
  const syntaxDiagnostics = expressionModule.diagnostics.filter(diagnostic => diagnostic.phase === "syntax" && diagnostic.severity === "error");
  if (syntaxDiagnostics.length) {
    throw new Error(syntaxDiagnostics.map(diagnostic => {
      const location = diagnostic.span ? `:${diagnostic.span.line}:${diagnostic.span.column}` : "";
      return `${diagnostic.filename ?? filename}${location} - ${diagnostic.message}`;
    }).join("\n"));
  }
  const sourceFile = ts.createSourceFile(filename, normalized, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const annotations = analyzeExactAnnotations(expressionModule);
  throwLocatedCompilerDiagnostics(filename, sourceFile, annotations.diagnostics);
  const manifest = analyzeSource(normalized, {
    filename,
    root: options.root,
    session: options.session,
    importedManifests,
    target,
    assetRules: options.assetRules,
    pluginRegistry: options.pluginRegistry,
    generatedValidation: options.generatedValidation
  });
  const pluginErrors = manifest.diagnostics.filter(diagnostic => /^error: \[@/.test(diagnostic));
  if (pluginErrors.length) throw new Error(pluginErrors.join("\n"));
  const semanticGraph = buildExpressionSemanticGraph(expressionModule);
  const provenance = buildExactProvenance(expressionModule);
  const expressionDerived = analyzeExpressionDerived(expressionModule, provenance);
  const expressionWrites = analyzeExpressionWrites(expressionModule);
  const moduleImports = analyzeModuleImports(normalized, filename, options.assetRules);
  const callableEffects = analyzeCallableEffects(expressionModule, semanticGraph, importedManifests, expressionWrites, moduleImports);
  const expressionTasks = analyzeExpressionTasks(expressionModule, callableEffects);
  const taskErrors = expressionTasks.diagnostics.filter(diagnostic => diagnostic.startsWith("error:"));
  if (taskErrors.length) {
    throw new Error(taskErrors.map(message => {
      const start = expressionTasks.diagnosticLocations.find(candidate => candidate.message === message)?.start;
      if (start === undefined) return `${filename} - ${message}`;
      const location = sourceFile.getLineAndCharacterOfPosition(start);
      return `${filename}:${location.line + 1}:${location.character + 1} - ${message}`;
    }).join("\n"));
  }
  const semanticErrors = manifest.diagnostics.filter(diagnostic => diagnostic.startsWith("error:"));
  if (semanticErrors.length) {
    throw new Error(semanticErrors.map(message => `${filename} - ${message}`).join("\n"));
  }
  const expressionJsx = analyzeExpressionJsx(expressionModule, provenance, filename);
  throwLocatedCompilerDiagnostics(filename, sourceFile, expressionJsx.diagnostics);
  const expressionComponents = analyzeExpressionComponents(expressionModule, expressionJsx, expressionTasks, provenance, expressionWrites, callableEffects);
  const emissionComponentInfo = new Map<string, ExactImportedComponentIR>();
  for (const component of collectExpressionImportedComponents(filename, importedManifests, semanticGraph)) emissionComponentInfo.set(component.name, component);
  for (const component of manifest.components) emissionComponentInfo.set(component.name, {
    name: component.name,
    boundaryName: component.name,
    placement: component.placement,
    componentId: component.id
  });
  const result = ts.transform(sourceFile, [exactJsxTransformer(
    expressionModule,
    filename,
    target,
    options.serverComponents ?? false,
    semanticGraph,
    expressionDerived,
    expressionWrites,
    expressionTasks,
    expressionJsx,
    expressionComponents,
    emissionComponentInfo,
    callableEffects,
    moduleImports,
    options.preserveClientAssetImports ?? false
  )]);
  const transformed = result.transformed[0]!;
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printed = emitExpressionRewrite(
    expressionModule,
    printer.printFile(transformed as ts.SourceFile),
    options.root,
    virtual,
    options.session,
    options.generatedValidation ?? "syntax"
  );
  result.dispose();
  validateTargetAnalysis(callableEffects, target, filename);
  const output = options.moduleTransform
    ? options.moduleTransform({ id: filename, source: printed, target }).code
    : options.moduleRewrite
      ? rewriteModuleReferences(printed, { ...options.moduleRewrite, filename, sourceMap: false }).code
      : printed;
  return {
    code: output,
    map: options.sourceMap ? createLineSourceMap(filename, normalized, output) : null,
    filename,
    manifest
  };
}

function validateTargetAnalysis(
  effects: ReturnType<typeof analyzeCallableEffects>,
  target: TransformTarget,
  filename: string
): void {
  if (target === "default") return;
  const forbidden = target === "client" ? "server" : "browser";
  const violation = effects.callables
    .filter(callable => callable.artifactTargets.includes(target))
    .flatMap(callable => callable.effectSources.map(source => ({ callable, source })))
    .find(candidate => candidate.source.environment === forbidden);
  if (violation) {
    throw new Error(`${filename} - error: ${target} artifact retained ${forbidden}-only dependency (${violation.source.path.join(" → ")})`);
  }
  const byId = new Map(effects.callables.map(callable => [callable.id, callable]));
  for (const caller of effects.callables.filter(callable => callable.artifactTargets.includes(target))) for (const edge of caller.calls) {
    const callee = edge.targetId ? byId.get(edge.targetId) : undefined;
    if (callee && !callee.artifactTargets.includes(target)) {
      throw new Error(`${filename} - error: ${target} artifact graph retains ${caller.name} → ${callee.name}, but ${callee.name} is omitted`);
    }
  }
}

function emitExpressionRewrite(
  module: BoundModule,
  generated: string,
  root: string | undefined,
  virtual: boolean,
  session: ExactCompilerSession | undefined,
  validation: "syntax" | "semantic"
): string {
  const rewritten = rewriteModule(module, rewriter => {
    rewriter.replaceTextWhere(reference => reference.node === module.rootNode, () => generated);
  });
  const structuralErrors = rewritten.validate().filter(diagnostic => diagnostic.severity === "error");
  if (structuralErrors.length) throw new ExpressionProjectError(structuralErrors);

  const emitted = rewritten.emit().code;
  if (validation === "syntax") {
    const sourceFile = ts.createSourceFile(
      `${module.filename}.exact.generated.tsx`,
      emitted,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
    if (diagnostics.length) {
      throw new ExpressionProjectError(diagnostics.map(diagnostic => ({
        ...diagnosticFromTypeScript(diagnostic),
        phase: "syntax" as const
      })));
    }
    return emitted;
  }

  const rebound = sessionExpressionModule(session, `${module.filename}.exact.generated.tsx`, emitted, {
    root,
    virtual,
    diagnostics: "full"
  });
  const baselineErrors = module.diagnostics.filter(diagnostic => diagnostic.severity === "error");
  const existing = new Map<string, number>();
  for (const diagnostic of baselineErrors) {
    const key = diagnosticIdentity(diagnostic, module.source);
    existing.set(key, (existing.get(key) ?? 0) + 1);
  }
  const introduced = rebound.diagnostics.filter(diagnostic => {
    if (diagnostic.severity !== "error") return false;
    const key = diagnosticIdentity(diagnostic, rebound.source);
    const count = existing.get(key) ?? 0;
    if (count) {
      existing.set(key, count - 1);
      return false;
    }
    return !isSyntheticHelperDiagnostic(diagnostic, rebound.source, module.source);
  });
  if (introduced.length) throw new ExpressionProjectError(introduced);
  return rebound.emit().code;
}

function diagnosticFromTypeScript(diagnostic: ts.Diagnostic): {
  code: string;
  message: string;
  severity: "error" | "warning";
  filename?: string;
  span?: { start: number; end: number; line: number; column: number };
} {
  const source = diagnostic.file;
  const start = diagnostic.start;
  const location = source && start !== undefined ? source.getLineAndCharacterOfPosition(start) : undefined;
  return {
    code: `TS${diagnostic.code}`,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
    filename: source?.fileName,
    span: start === undefined || !location ? undefined : {
      start,
      end: start + (diagnostic.length ?? 0),
      line: location.line + 1,
      column: location.character + 1
    }
  };
}

function throwLocatedCompilerDiagnostics(
  filename: string,
  sourceFile: ts.SourceFile,
  diagnostics: readonly Readonly<{ message: string; start: number }>[]
): void {
  const errors = diagnostics.filter(diagnostic => diagnostic.message.startsWith("error:"));
  if (!errors.length) return;
  throw new Error(errors.map(diagnostic => {
    const location = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
    return `${filename}:${location.line + 1}:${location.character + 1} - ${diagnostic.message}`;
  }).join("\n"));
}

function diagnosticIdentity(
  diagnostic: { code: string; message: string; span?: { start: number; end: number } },
  source: string
): string {
  if (!diagnostic.span) return `${diagnostic.code}:${diagnostic.message}:<global>`;
  const lineStart = source.lastIndexOf("\n", diagnostic.span.start) + 1;
  const lineEnd = source.indexOf("\n", diagnostic.span.end);
  const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd).trim().replace(/\s+/g, " ");
  const token = source.slice(diagnostic.span.start, diagnostic.span.end);
  return `${diagnostic.code}:${diagnostic.message}:${token}:${line}`;
}

function isSyntheticHelperDiagnostic(
  diagnostic: { code: string; span?: { start: number; end: number } },
  source: string,
  originalSource: string
): boolean {
  if (!diagnostic.span) return false;
  const token = source.slice(diagnostic.span.start, diagnostic.span.end);
  const lineStart = source.lastIndexOf("\n", diagnostic.span.start) + 1;
  const lineEnd = source.indexOf("\n", diagnostic.span.end);
  const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
  // Only compiler-reserved bindings/imports may suppress diagnostics. Author
  // code with the same diagnostic code remains visible at its own location.
  const normalizedLine = line.trim().replace(/\s+/g, " ");
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
  const originalOccurrences = originalSource.split(/\r?\n/).filter(original => normalize(original) === normalizedLine).length;
  const generatedOccurrences = source.split(/\r?\n/).filter(generated => normalize(generated) === normalizedLine).length;
  const retained = originalOccurrences > 0 && generatedOccurrences <= originalOccurrences;
  return /^__exact/.test(token)
    || /^\s*import\b/.test(line) && /\b__exact[A-Za-z0-9_$]*\b/.test(line)
    || /\b__exact[A-Za-z0-9_$]*\b/.test(line)
    || !retained;
}

/** Analyzes source into the compiler manifest without emitting transformed code. */
export function analyzeSource(source: string, options: TransformOptions = {}): ExactCompilerManifest {
  const normalized = preprocessPropPunning(source);
  const filename = options.filename ?? "input.tsx";
  const importedManifests = validatedImportedManifests(options.importedManifests, options.pluginRegistry);
  const expressionModule = sessionExpressionModule(options.session, filename, normalized, {
    root: options.root,
    diagnostics: options.generatedValidation === "semantic" ? "full" : "syntax"
  });
  const exports: ExactExportIR[] = [];
  const symbols: ExactSymbolIR[] = [];
  const boundaries: ExactBoundaryIR[] = [];
  const manifestDiagnostics: string[] = [];
  const serverActions: ExactCompilerManifest["serverActions"] = {};
  const semanticGraph = buildExpressionSemanticGraph(expressionModule);
  const provenance = buildExactProvenance(expressionModule);
  const expressionSafety = analyzeExpressionSafety(expressionModule, provenance);
  const expressionWrites = analyzeExpressionWrites(expressionModule);
  const moduleImports = analyzeModuleImports(normalized, filename, options.assetRules);
  const callableEffects = analyzeCallableEffects(expressionModule, semanticGraph, importedManifests, expressionWrites, moduleImports);
  manifestDiagnostics.push(...moduleImports.diagnostics);
  for (const initializer of callableEffects.callables.filter(callable => callable.kind === "module-initializer")) {
    if (initializer.effect === "mixed") manifestDiagnostics.push(`error: executable module initializer has indivisible browser and server effects (${effectDiagnosticPath(initializer, "mixed")})`);
    if (initializer.effect === "unknown") manifestDiagnostics.push(`error: executable module initializer depends on an opaque call or side-effect import (${effectDiagnosticPath(initializer, "unknown")})`);
  }
  const expressionTasks = analyzeExpressionTasks(expressionModule, callableEffects);
  manifestDiagnostics.push(...expressionTasks.diagnostics);
  manifestDiagnostics.push(...analyzeExactAnnotations(expressionModule).diagnostics.map(diagnostic => diagnostic.message));
  const expressionJsx = analyzeExpressionJsx(expressionModule, provenance, filename);
  manifestDiagnostics.push(...expressionJsx.diagnostics.map(diagnostic => diagnostic.message));
  const expressionComponents = analyzeExpressionComponents(expressionModule, expressionJsx, expressionTasks, provenance, expressionWrites, callableEffects);
  const components: ExactComponentIR[] = createExpressionComponents(filename, expressionComponents, expressionTasks, expressionSafety);

  const componentByName = new Map(components.map(component => [component.name, component]));
  const importedComponents = collectExpressionImportedComponents(filename, importedManifests, semanticGraph);
  const componentInfo = new Map<string, ExactImportedComponentIR>();
  for (const component of importedComponents) componentInfo.set(component.name, component);
  for (const component of components) {
    componentInfo.set(component.name, {
      name: component.name,
      boundaryName: component.name,
      placement: component.placement,
      componentId: component.id
    });
  }
  for (const component of components) {
    const expressionComponent = expressionComponents.sites.get(component.name);
    component.renderEdges = createExpressionRenderEdges(filename, component.name, expressionComponent?.renders ?? [], componentInfo);
    component.subgraphPlacement = combinePlacements([
      component.placement,
      ...component.renderEdges.map(edge => edge.placement)
    ]);
  }
  const exportBindings = collectExpressionExportBindings(semanticGraph);
  const exportedLocals = new Set([...exportBindings.values()].map(binding => binding.localName));
  for (const component of components) {
    component.exported = exportedLocals.has(component.name);
  }
  for (const binding of [...exportBindings.values()].sort((left, right) => left.exportedName.localeCompare(right.exportedName))) {
    const component = componentByName.get(binding.localName);
    const callable = callableEffects.callables.find(candidate => candidate.exportNames.includes(binding.exportedName));
    exports.push({
      name: binding.exportedName,
      kind: component ? "component" : "value",
      placement: component?.placement ?? (callable?.effect === "browser" || callable?.artifactTargets.length === 1 && callable.artifactTargets[0] === "client" ? "client" : callable?.effect === "server" || callable?.artifactTargets.length === 1 && callable.artifactTargets[0] === "server" ? "server" : callable?.effect === "neutral" ? "isomorphic" : "unknown")
    });
  }
  symbols.push(...createRootSymbols(filename, components, [...exportBindings.values()]));
  const componentExportNames = new Set(exports.filter(exported => exported.kind === "component").map(exported => exported.name));
  symbols.push(...createValueRootSymbols(filename, callableEffects.callables.map(callable => ({
    ...callable,
    exportNames: callable.exportNames.filter(name => !componentExportNames.has(name))
  }))));
  symbols.push(...createServerPartSymbols(filename, components));
  symbols.push(...createClientIslandSymbols(filename, components));
  boundaries.push(...createClientIslandBoundaries(filename, components));
  boundaries.push(...createExpressionGeneratedServerSlotBoundaries(filename, components, expressionComponents, componentInfo));
  boundaries.push(...createExpressionComponentBoundaries(filename, components, expressionComponents, componentInfo));

  for (const component of components) {
    for (const task of component.tasks) {
      if (task.placement === "server" || task.placement === "isomorphic") {
        // Server action IDs become endpoint-dispatch keys, so duplicate IDs must
        // fail during compilation instead of letting later entries overwrite earlier ones.
        if (serverActions[task.id]) {
          throw new Error(`Duplicate eXact server action id generated: ${task.id}`);
        }
        serverActions[task.id] = {
          id: task.id,
          componentId: component.id,
          taskId: task.id,
          placement: task.placement,
          stateContract: {
            reads: task.reads,
            writes: task.writes
          },
          contextContract: task.contexts
        };
      }
    }
    manifestDiagnostics.push(...component.diagnostics);
  }

  assertUniqueIds("component", components.map(component => component.id));
  assertUniqueIds("symbol", symbols.map(symbol => symbol.id));
  assertUniqueIds("boundary", boundaries.map(boundary => boundary.id));
  assertUniqueIds("callable", callableEffects.callables.map(callable => callable.id));
  const pluginContributions = applyCompilerPlugins(
    normalized,
    filename,
    options.target ?? "default",
    options.pluginRegistry
  );

  return {
    version: exactCompilerManifestVersion,
    filename,
    dependencies: [],
    assets: [...moduleImports.assets],
    semanticGraph: portableSemanticGraph(semanticGraph, expressionModule.filename, filename),
    components,
    exports,
    symbols,
    boundaries,
    callables: [...callableEffects.callables],
    serverActions,
    ...(pluginContributions.pluginRegistry ? { pluginRegistry: pluginContributions.pluginRegistry } : {}),
    ...(pluginContributions.pluginData && Object.keys(pluginContributions.pluginData).length
      ? { pluginData: pluginContributions.pluginData }
      : {}),
    diagnostics: [...manifestDiagnostics, ...pluginContributions.diagnostics]
  };
}

function effectDiagnosticPath(
  initializer: ExactCompilerManifest["callables"][number],
  effect: "mixed" | "unknown"
): string {
  if (effect === "unknown") {
    return initializer.effectSources.find(source => source.environment === "unknown")?.path.join(" → ") ?? initializer.name;
  }
  const browser = initializer.effectSources.find(source => source.environment === "browser")?.path.join(" → ");
  const server = initializer.effectSources.find(source => source.environment === "server")?.path.join(" → ");
  return browser && server ? `${browser} ↔ ${server}` : browser ?? server ?? initializer.name;
}

function validatedImportedManifests(
  manifests: readonly ExactCompilerManifest[] | undefined,
  registry: TransformOptions["pluginRegistry"]
): ExactCompilerManifest[] {
  const parsed = (manifests ?? []).map((manifest, index) =>
    parseExactCompilerManifest(manifest, `imported compiler manifest ${index + 1}`)
  );
  validateImportedPluginRegistries(parsed, registry);
  return parsed;
}

function assertUniqueIds(label: string, ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate eXact ${label} id generated: ${id}`);
    seen.add(id);
  }
}

function portableSemanticGraph(
  graph: ExactSemanticGraphIR,
  boundFilename: string,
  declaredFilename: string
): ExactSemanticGraphIR {
  const bound = boundFilename.replace(/\\/g, "/").toLowerCase();
  const declared = declaredFilename.replace(/\\/g, "/").toLowerCase();
  const rewrite = (id: string | undefined): string | undefined => id?.startsWith(bound) ? `${declared}${id.slice(bound.length)}` : id;
  return {
    scopes: graph.scopes.map(scope => ({ ...scope, id: rewrite(scope.id)!, ...(scope.parentId ? { parentId: rewrite(scope.parentId)! } : {}) })),
    declarations: graph.declarations.map(declaration => ({ ...declaration, id: rewrite(declaration.id)!, scopeId: rewrite(declaration.scopeId)! })),
    references: graph.references.map(reference => ({
      ...reference,
      scopeId: rewrite(reference.scopeId)!,
      ...(reference.declarationId ? { declarationId: rewrite(reference.declarationId)! } : {})
    })),
    exports: graph.exports.map(exported => ({ ...exported }))
  };
}

/** Builds the semantic graph used for reference/declaration tracing diagnostics and tests. */
export function analyzeSemanticGraph(source: string, options: Pick<TransformOptions, "filename" | "root" | "session"> = {}): ExactSemanticGraphIR {
  const normalized = preprocessPropPunning(source);
  const filename = options.filename ?? "input.tsx";
  return buildExpressionSemanticGraph(sessionExpressionModule(options.session, filename, normalized, { root: options.root }));
}

function sessionExpressionModule(
  session: ExactCompilerSession | undefined,
  filename: string,
  source: string,
  options: Parameters<typeof expressionModuleFor>[2]
): BoundModule {
  return session
    ? session.expressionModuleFor(filename, source, options)
    : expressionModuleFor(filename, source, options);
}

/** Compiles one input file and optionally writes code, source map, and manifest artifacts. */
export async function compileFile(inputFile: string, options: CompileFileOptions = {}): Promise<CompileFileResult> {
  const source = await readFile(inputFile, "utf8");
  const result = transformSource(source, { filename: options.filename ?? inputFile, session: options.session, target: options.target, serverComponents: options.serverComponents, sourceMap: options.sourceMap, moduleRewrite: options.moduleRewrite, moduleTransform: options.moduleTransform, assetRules: options.assetRules, preserveClientAssetImports: options.preserveClientAssetImports, pluginRegistry: options.pluginRegistry, generatedValidation: options.generatedValidation });
  const outputFile = options.outDir ? outputPathFor(inputFile, options.outDir, options.rootDir) : undefined;
  const sourceMapFile = outputFile && result.map ? sourceMapPathFor(outputFile) : undefined;
  const manifestFile = outputFile && options.emitManifest ? manifestPathFor(outputFile) : undefined;

  if (outputFile) {
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, sourceMapFile ? withSourceMappingUrl(result.code, path.basename(sourceMapFile)) : result.code);
  }
  if (sourceMapFile && result.map) {
    await mkdir(path.dirname(sourceMapFile), { recursive: true });
    await writeFile(sourceMapFile, `${JSON.stringify(withSourceMapFile(result.map, path.basename(outputFile!)), null, 2)}\n`);
  }
  if (manifestFile) {
    await mkdir(path.dirname(manifestFile), { recursive: true });
    await writeFile(manifestFile, `${JSON.stringify(result.manifest, null, 2)}\n`);
  }

  return {
    ...result,
    inputFile,
    outputFile,
    sourceMapFile,
    manifestFile
  };
}

/** Compiles all transformable files found under the provided input paths. */
export async function compileProject(inputs: readonly string[], options: CompileProjectOptions = {}): Promise<CompileFileResult[]> {
  const files = await collectInputFiles(inputs);
  const rootDir = options.rootDir ?? commonRoot(files);
  const results: CompileFileResult[] = [];

  for (const file of files) {
    results.push(await compileFile(file, {
      outDir: options.outDir,
      rootDir,
      target: options.target,
      emitManifest: options.emitManifest,
      serverComponents: options.serverComponents,
      sourceMap: options.sourceMap,
      session: options.session,
      moduleRewrite: options.moduleRewrite,
      moduleTransform: options.moduleTransform,
      assetRules: options.assetRules,
      preserveClientAssetImports: options.preserveClientAssetImports,
      pluginRegistry: options.pluginRegistry
    }));
  }

  return results;
}

/** Compiles one source file into paired client/server artifacts plus an artifact manifest. */
export async function compileFileArtifacts(inputFile: string, options: CompileArtifactsOptions): Promise<CompileArtifactsResult> {
  const source = await readFile(inputFile, "utf8");
  const filename = options.filename ?? inputFile;
  const manifestBase = analyzeSource(source, { filename, session: options.session, importedManifests: options.importedManifests, assetRules: options.assetRules, pluginRegistry: options.pluginRegistry, generatedValidation: options.generatedValidation });
  const client = transformSource(source, { filename, session: options.session, target: "client", importedManifests: options.importedManifests, serverComponents: options.serverComponents, sourceMap: options.sourceMap, moduleRewrite: options.moduleRewrite, moduleTransform: options.moduleTransform, assetRules: options.assetRules, pluginRegistry: options.pluginRegistry, generatedValidation: options.generatedValidation });
  const server = transformSource(source, { filename, session: options.session, target: "server", importedManifests: options.importedManifests, serverComponents: options.serverComponents, sourceMap: options.sourceMap, moduleRewrite: options.moduleRewrite, moduleTransform: options.moduleTransform, assetRules: options.assetRules, pluginRegistry: options.pluginRegistry, generatedValidation: options.generatedValidation });
  const paths = artifactPathsFor(inputFile, options.outDir, options.rootDir);
  const manifest = withArtifactMetadata(manifestBase, inputFile, paths);
  const clientMapFile = client.map ? sourceMapPathFor(paths.clientFile) : undefined;
  const serverMapFile = server.map ? sourceMapPathFor(paths.serverFile) : undefined;

  await mkdir(path.dirname(paths.clientFile), { recursive: true });
  await writeFile(paths.clientFile, clientMapFile ? withSourceMappingUrl(client.code, path.basename(clientMapFile)) : client.code);
  await writeFile(paths.serverFile, serverMapFile ? withSourceMappingUrl(server.code, path.basename(serverMapFile)) : server.code);
  if (clientMapFile && client.map) await writeFile(clientMapFile, `${JSON.stringify(withSourceMapFile(client.map, path.basename(paths.clientFile)), null, 2)}\n`);
  if (serverMapFile && server.map) await writeFile(serverMapFile, `${JSON.stringify(withSourceMapFile(server.map, path.basename(paths.serverFile)), null, 2)}\n`);
  await writeFile(paths.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    inputFile,
    ...paths,
    clientMapFile,
    serverMapFile,
    client,
    server,
    manifest
  };
}

/** Compiles all artifact plan entries for the provided source inputs. */
export async function compileProjectArtifacts(inputs: readonly string[], options: CompileArtifactsOptions): Promise<CompileArtifactsResult[]> {
  const plan = await createExactArtifactPlan(inputs, options);
  return compileArtifactPlanEntries(plan.entries, {
    filename: entry => options.filename ?? entry.inputFile,
    importedManifests: options.importedManifests,
    serverComponents: options.serverComponents,
    sourceMap: options.sourceMap,
    session: options.session,
    moduleRewrite: options.moduleRewrite,
    moduleTransform: options.moduleTransform,
    assetRules: options.assetRules,
    pluginRegistry: options.pluginRegistry
  });
}

/** Compiles precomputed artifact plan entries, sharing manifests so cross-file analysis can see siblings. */
export async function compileArtifactPlanEntries(
  entries: readonly ExactArtifactPlanEntry[],
  options: CompileArtifactPlanEntriesOptions = {}
): Promise<CompileArtifactsResult[]> {
  const results: CompileArtifactsResult[] = [];
  const manifestBases = new Map<string, ExactCompilerManifest>();
  const sources = new Map<string, string>();

  for (const entry of entries) {
    const filename = options.filename?.(entry) ?? entry.inputFile;
    const source = await readFile(entry.inputFile, "utf8");
    sources.set(path.resolve(entry.inputFile), source);
  }
  const dependencyGraph = await collectPlacementAnalysisDependencies(sources, options.session);
  for (const [inputFile, source] of sources) manifestBases.set(inputFile, analyzeSource(source, { filename: inputFile, session: options.session, assetRules: options.assetRules, pluginRegistry: options.pluginRegistry, generatedValidation: options.generatedValidation }));
  // Resolve cross-file callable summaries to a fixed point. Each pass consumes
  // the previous immutable manifest generation, so results do not depend on
  // source ordering and recursive import groups converge monotonically.
  const maxPasses = Math.max(2, sources.size + 2);
  for (let pass = 0; pass < maxPasses; pass++) {
    const imported = [...(options.importedManifests ?? []), ...manifestBases.values()];
    const next = new Map<string, ExactCompilerManifest>();
    let changed = false;
    for (const [key, source] of sources) {
      const entry = entries.find(candidate => path.resolve(candidate.inputFile) === key);
      const filename = entry ? options.filename?.(entry) ?? entry.inputFile : key;
      const manifest = analyzeSource(source, { filename, session: options.session, importedManifests: imported, assetRules: options.assetRules, pluginRegistry: options.pluginRegistry, generatedValidation: options.generatedValidation });
      next.set(key, manifest);
      if (callableEffectSignature(manifest) !== callableEffectSignature(manifestBases.get(key)!)) changed = true;
    }
    manifestBases.clear();
    for (const [key, manifest] of next) manifestBases.set(key, manifest);
    if (!changed) break;
    if (pass === maxPasses - 1) throw new Error("eXact placement inference did not converge");
  }
  const importedManifests = [...(options.importedManifests ?? []), ...manifestBases.values()];

  for (const entry of entries) {
    const filename = options.filename?.(entry) ?? entry.inputFile;
    results.push(await compileArtifactPlanEntry(entry, filename, importedManifests, options.serverComponents ?? false, options.sourceMap ?? false, transitiveDependencies(path.resolve(entry.inputFile), dependencyGraph), options.moduleRewrite, options.moduleTransform, options.session, options.assetRules, options.pluginRegistry, options.generatedValidation));
  }

  return results;
}

async function collectPlacementAnalysisDependencies(
  sources: Map<string, string>,
  session?: ExactCompilerSession
): Promise<Map<string, string[]>> {
  const graph = new Map<string, string[]>();
  const pending = [...sources.keys()];
  while (pending.length) {
    const filename = pending.shift()!;
    const source = sources.get(filename)!;
    const resolvedDependencies: string[] = [];
    for (const dependency of session
      ? session.expressionDependencyFiles(filename, source)
      : expressionDependencyFiles(filename, source)) {
      const resolved = path.resolve(dependency);
      if (/(?:^|[\\/])node_modules(?:[\\/]|$)/.test(resolved) || /\.d\.[cm]?ts$/i.test(resolved) || !/\.[cm]?[jt]sx?$/i.test(resolved)) continue;
      try {
        await access(resolved);
        resolvedDependencies.push(resolved);
        if (!sources.has(resolved)) {
          sources.set(resolved, await readFile(resolved, "utf8"));
          pending.push(resolved);
        }
      } catch {
        // Resolution candidates include extension substitutions that may not exist.
      }
    }
    graph.set(filename, [...new Set(resolvedDependencies)].sort());
  }
  return graph;
}

function transitiveDependencies(entry: string, graph: ReadonlyMap<string, readonly string[]>): string[] {
  const result = new Set<string>();
  const pending = [...(graph.get(entry) ?? [])];
  while (pending.length) {
    const dependency = pending.shift()!;
    if (result.has(dependency)) continue;
    result.add(dependency);
    pending.push(...(graph.get(dependency) ?? []));
  }
  return [...result];
}

function callableEffectSignature(manifest: ExactCompilerManifest): string {
  return manifest.callables.map(callable => `${callable.id}:${callable.effect}:${callable.effectSources.map(source => `${source.environment}:${source.description}`).join(",")}:${JSON.stringify(callable.stateReads)}:${JSON.stringify(callable.stateWrites)}:${JSON.stringify(callable.contexts)}`).join("|");
}

async function compileArtifactPlanEntry(
  entry: ExactArtifactPlanEntry,
  filename: string,
  importedManifests: readonly ExactCompilerManifest[] = [],
  serverComponents = false,
  sourceMap = false,
  dependencies: readonly string[] = [],
  moduleRewrite?: ModuleRewriteOptions,
  moduleTransform?: import("./types.js").ModuleTransform,
  session?: ExactCompilerSession,
  assetRules?: TransformOptions["assetRules"],
  pluginRegistry?: TransformOptions["pluginRegistry"],
  generatedValidation?: TransformOptions["generatedValidation"]
): Promise<CompileArtifactsResult> {
  const source = await readFile(entry.inputFile, "utf8");
  const base = analyzeSource(source, { filename, session, importedManifests, assetRules, pluginRegistry, generatedValidation });
  base.dependencies = dependencies
    .map(dependency => path.relative(path.dirname(path.resolve(filename)), dependency).replaceAll(path.sep, "/"))
    .sort();
  const client = transformSource(source, { filename, session, target: "client", importedManifests, serverComponents, sourceMap, moduleRewrite, moduleTransform, assetRules, pluginRegistry, generatedValidation });
  const server = transformSource(source, { filename, session, target: "server", importedManifests, serverComponents, sourceMap, moduleRewrite, moduleTransform, assetRules, pluginRegistry, generatedValidation });
  const manifest = withArtifactMetadata(base, entry.inputFile, entry);
  const clientMapFile = client.map ? sourceMapPathFor(entry.clientFile) : undefined;
  const serverMapFile = server.map ? sourceMapPathFor(entry.serverFile) : undefined;

  await mkdir(path.dirname(entry.clientFile), { recursive: true });
  await writeFile(entry.clientFile, clientMapFile ? withSourceMappingUrl(client.code, path.basename(clientMapFile)) : client.code);
  await writeFile(entry.serverFile, serverMapFile ? withSourceMappingUrl(server.code, path.basename(serverMapFile)) : server.code);
  if (clientMapFile && client.map) await writeFile(clientMapFile, `${JSON.stringify(withSourceMapFile(client.map, path.basename(entry.clientFile)), null, 2)}\n`);
  if (serverMapFile && server.map) await writeFile(serverMapFile, `${JSON.stringify(withSourceMapFile(server.map, path.basename(entry.serverFile)), null, 2)}\n`);
  await writeFile(entry.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    inputFile: entry.inputFile,
    clientFile: entry.clientFile,
    serverFile: entry.serverFile,
    clientMapFile,
    serverMapFile,
    manifestFile: entry.manifestFile,
    client,
    server,
    manifest
  };
}

/** Creates deterministic client/server artifact output paths for a set of inputs. */
export async function createExactArtifactPlan(inputs: readonly string[], options: ExactArtifactPlanOptions): Promise<ExactArtifactPlan> {
  const files = await collectInputFiles(inputs);
  const rootDir = options.rootDir ?? commonRoot(files);
  return {
    rootDir,
    entries: files.map(inputFile => ({
      inputFile,
      ...artifactPathsFor(inputFile, options.outDir, rootDir)
    }))
  };
}

/** Compiles an artifact graph state useful for watch-mode bundler integrations. */
export async function createExactArtifactDevState(
  inputs: readonly string[],
  options: ExactArtifactDevStateOptions
): Promise<ExactArtifactDevState> {
  const plan = await createExactArtifactPlan(inputs, options);
  const compiled = await compileArtifactPlanEntries(plan.entries, {
    filename: entry => options.filename ?? entry.inputFile,
    importedManifests: options.importedManifests,
    serverComponents: options.serverComponents,
    session: options.session,
    pluginRegistry: options.pluginRegistry
  });
  const entries = compiled.map(artifactGraphEntryFromCompileResult);
  return {
    plan,
    entries,
    graph: createExactArtifactGraph(entries, options)
  };
}

/** Updates a watch-mode artifact graph by recompiling added and changed inputs only. */
export async function updateExactArtifactDevState(
  state: ExactArtifactDevState,
  inputs: readonly string[],
  changedInputs: readonly string[],
  options: ExactArtifactDevStateOptions
): Promise<ExactArtifactDevStateUpdate> {
  for (const changed of changedInputs) {
    let removed = false;
    try { await access(changed); } catch { removed = true; }
    if (options.session) options.session.invalidate(changed, removed);
    else invalidateExpressionModule(changed, removed);
  }
  const nextPlan = await createExactArtifactPlan(inputs, options);
  const changed = new Set(changedInputs.map(input => path.resolve(input)));
  const effectiveChanges = new Set(changed);
  for (const entry of state.entries) {
    if (entry.manifest.dependencies.some(dependency => changed.has(path.resolve(path.dirname(entry.manifest.filename), dependency)))) effectiveChanges.add(path.resolve(entry.inputFile));
  }
  const diff = diffExactArtifactPlans(state.plan, nextPlan, { changedInputs: [...effectiveChanges] });
  const retainedManifestFiles = diff.retained.map(entry => entry.manifestFile);
  const retainedEntries = retainedManifestFiles.length
    ? await readExactArtifactManifestEntries(retainedManifestFiles)
    : [];
  const compiled = await compileArtifactPlanEntries([...diff.added, ...diff.changed], {
    filename: entry => options.filename ?? entry.inputFile,
    importedManifests: [
      ...(options.importedManifests ?? []),
      ...retainedEntries.map(entry => entry.manifest)
    ],
    serverComponents: options.serverComponents,
    session: options.session,
    pluginRegistry: options.pluginRegistry
  });
  const entries = [
    ...retainedEntries,
    ...compiled.map(artifactGraphEntryFromCompileResult)
  ].sort((left, right) => left.inputFile.localeCompare(right.inputFile));
  return {
    plan: nextPlan,
    entries,
    graph: createExactArtifactGraph(entries, options),
    diff,
    compiled
  };
}

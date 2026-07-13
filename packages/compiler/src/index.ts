import ts from "typescript";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  artifactGraphEntryFromCompileResult,
  createExactArtifactGraph,
  diffExactArtifactPlans,
  readExactArtifactManifestEntries
} from "./artifacts.js";
import {
  analyzeComponent,
  collectComponentRenderEdges,
  combinePlacements,
  createClientComponentTagBoundaries,
  createGeneratedClientIslandServerSlotBoundaries,
  createServerSlotBoundaries
} from "./component-analysis.js";
import type {
  CompileArtifactPlanEntriesOptions,
  CompileArtifactsOptions,
  CompileArtifactsResult,
  CompileFileOptions,
  CompileFileResult,
  CompileProjectOptions,
  ComponentLocalInfo,
  DerivedReactiveIndex,
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
  collectExportBindings
} from "./exports.js";
import {
  collectImportedComponents,
  collectServerOnlyImports
} from "./imports.js";
import { generatedComponentName } from "./names.js";
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
  buildExpressionSemanticGraph,
  createSemanticDeclarationIndex,
  createSemanticReferenceIndex
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
  createServerPartSymbols
} from "./symbols.js";
import { exactJsxTransformer } from "./jsx-transform.js";
import { exactCompilerManifestVersion } from "./versions.js";
import { expressionModuleFor } from "./expression-project.js";
import { buildExactProvenance } from "./provenance.js";

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
export { clearExpressionProjectCache } from "./expression-project.js";
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
  return buildExactProvenance(expressionModuleFor(filename, preprocessPropPunning(source)));
}

/** Transforms eXact TSX/JSX source and returns only the generated code. */
export function transform(source: string, options: TransformOptions = {}): string {
  return transformSource(source, options).code;
}

/** Transforms eXact TSX/JSX source into code, source map metadata, and compiler manifest. */
export function transformSource(source: string, options: TransformOptions = {}): TransformResult {
  const normalized = preprocessPropPunning(source);
  const filename = options.filename ?? "input.tsx";
  const target = options.target ?? "default";
  const expressionModule = expressionModuleFor(filename, normalized);
  const syntaxDiagnostics = expressionModule.diagnostics.filter(diagnostic => diagnostic.phase === "syntax" && diagnostic.severity === "error");
  if (syntaxDiagnostics.length) {
    throw new Error(syntaxDiagnostics.map(diagnostic => {
      const location = diagnostic.span ? `:${diagnostic.span.line}:${diagnostic.span.column}` : "";
      return `${diagnostic.filename ?? filename}${location} - ${diagnostic.message}`;
    }).join("\n"));
  }
  const manifest = analyzeSource(normalized, { filename, importedManifests: options.importedManifests });
  const semanticErrors = manifest.diagnostics.filter(diagnostic => diagnostic.startsWith("error:"));
  if (semanticErrors.length) {
    throw new Error(semanticErrors.join("\n"));
  }
  const sourceFile = ts.createSourceFile(filename, normalized, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const provenance = buildExactProvenance(expressionModule);
  const result = ts.transform(sourceFile, [exactJsxTransformer(target, options.importedManifests ?? [], options.serverComponents ?? false, manifest.semanticGraph, provenance)]);
  const transformed = result.transformed[0]!;
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printed = printer.printFile(transformed as ts.SourceFile);
  result.dispose();
  return {
    code: printed,
    map: options.sourceMap ? createLineSourceMap(filename, normalized, printed) : null,
    filename,
    manifest
  };
}

/** Analyzes source into the compiler manifest without emitting transformed code. */
export function analyzeSource(source: string, options: TransformOptions = {}): ExactCompilerManifest {
  const normalized = preprocessPropPunning(source);
  const filename = options.filename ?? "input.tsx";
  const expressionModule = expressionModuleFor(filename, normalized);
  const expressionFunctions = new Map(
    expressionModule.walk().functions()
      .where(reference => reference.node.kind === "FunctionDeclaration" && !!reference.node.span && /^[A-Z]/.test(reference.node.name ?? ""))
      .toArray()
      .map(reference => [reference.node.span!.start, reference.node.name] as const)
  );
  const sourceFile = ts.createSourceFile(filename, normalized, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const components: ExactComponentIR[] = [];
  const exports: ExactExportIR[] = [];
  const symbols: ExactSymbolIR[] = [];
  const boundaries: ExactBoundaryIR[] = [];
  const manifestDiagnostics: string[] = [];
  const serverActions: ExactCompilerManifest["serverActions"] = {};
  const semanticGraph = buildExpressionSemanticGraph(expressionModule);
  const semanticReferences = createSemanticReferenceIndex(sourceFile, semanticGraph);
  const semanticDeclarations = createSemanticDeclarationIndex(sourceFile, semanticGraph);
  const serverOnlyImports = collectServerOnlyImports(sourceFile, semanticGraph);
  const componentNodes = new Map<string, ts.FunctionDeclaration>();

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && expressionFunctions.get(node.getStart(sourceFile)) === node.name.text) {
      componentNodes.set(node.name.text, node);
      components.push(analyzeComponent(node.name.text, node, sourceFile, serverOnlyImports, semanticReferences, semanticDeclarations));
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  const componentByName = new Map(components.map(component => [component.name, component]));
  const importedComponents = collectImportedComponents(sourceFile, options.importedManifests ?? [], semanticGraph);
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
  const componentPlacements = new Map([...componentInfo].map(([name, component]) => [name, component.placement]));
  for (const component of components) {
    const node = componentNodes.get(component.name);
    if (!node) continue;
    component.renderEdges = collectComponentRenderEdges(node, sourceFile, componentInfo, semanticReferences);
    component.subgraphPlacement = combinePlacements([
      component.placement,
      ...component.renderEdges.map(edge => edge.placement)
    ]);
  }
  const exportBindings = collectExportBindings(sourceFile, semanticGraph);
  const exportedLocals = new Set([...exportBindings.values()].map(binding => binding.localName));
  for (const component of components) {
    component.exported = exportedLocals.has(component.name);
  }
  for (const binding of [...exportBindings.values()].sort((left, right) => left.exportedName.localeCompare(right.exportedName))) {
    const component = componentByName.get(binding.localName);
    exports.push({
      name: binding.exportedName,
      kind: component ? "component" : "value",
      placement: component?.placement ?? "unknown"
    });
  }
  symbols.push(...createRootSymbols(sourceFile, components, [...exportBindings.values()]));
  symbols.push(...createServerPartSymbols(sourceFile, components));
  symbols.push(...createClientIslandSymbols(sourceFile, components));
  boundaries.push(...createClientIslandBoundaries(sourceFile, components));
  boundaries.push(...createGeneratedClientIslandServerSlotBoundaries(sourceFile, components, serverOnlyImports, semanticReferences, componentPlacements));
  boundaries.push(...createClientComponentTagBoundaries(sourceFile, components, componentInfo, componentPlacements, semanticReferences));
  boundaries.push(...createServerSlotBoundaries(sourceFile, components, componentInfo, componentPlacements, semanticReferences));

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

  return {
    version: exactCompilerManifestVersion,
    filename,
    semanticGraph,
    components,
    exports,
    symbols,
    boundaries,
    serverActions,
    diagnostics: manifestDiagnostics
  };
}

function assertUniqueIds(label: string, ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate eXact ${label} id generated: ${id}`);
    seen.add(id);
  }
}

/** Builds the semantic graph used for reference/declaration tracing diagnostics and tests. */
export function analyzeSemanticGraph(source: string, options: Pick<TransformOptions, "filename"> = {}): ExactSemanticGraphIR {
  const normalized = preprocessPropPunning(source);
  const filename = options.filename ?? "input.tsx";
  return buildExpressionSemanticGraph(expressionModuleFor(filename, normalized));
}

/** Compiles one input file and optionally writes code, source map, and manifest artifacts. */
export async function compileFile(inputFile: string, options: CompileFileOptions = {}): Promise<CompileFileResult> {
  const source = await readFile(inputFile, "utf8");
  const result = transformSource(source, { filename: options.filename ?? inputFile, target: options.target, serverComponents: options.serverComponents, sourceMap: options.sourceMap });
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
      sourceMap: options.sourceMap
    }));
  }

  return results;
}

/** Compiles one source file into paired client/server artifacts plus an artifact manifest. */
export async function compileFileArtifacts(inputFile: string, options: CompileArtifactsOptions): Promise<CompileArtifactsResult> {
  const source = await readFile(inputFile, "utf8");
  const filename = options.filename ?? inputFile;
  const manifestBase = analyzeSource(source, { filename, importedManifests: options.importedManifests });
  const client = transformSource(source, { filename, target: "client", importedManifests: options.importedManifests, serverComponents: options.serverComponents, sourceMap: options.sourceMap });
  const server = transformSource(source, { filename, target: "server", importedManifests: options.importedManifests, serverComponents: options.serverComponents, sourceMap: options.sourceMap });
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
    sourceMap: options.sourceMap
  });
}

/** Compiles precomputed artifact plan entries, sharing manifests so cross-file analysis can see siblings. */
export async function compileArtifactPlanEntries(
  entries: readonly ExactArtifactPlanEntry[],
  options: CompileArtifactPlanEntriesOptions = {}
): Promise<CompileArtifactsResult[]> {
  const results: CompileArtifactsResult[] = [];
  const manifestBases = new Map<string, ExactCompilerManifest>();

  for (const entry of entries) {
    const filename = options.filename?.(entry) ?? entry.inputFile;
    const source = await readFile(entry.inputFile, "utf8");
    manifestBases.set(path.resolve(entry.inputFile), analyzeSource(source, { filename }));
  }
  // Analyze all files first, then compile with sibling manifests available. This
  // lets client/server splitting understand package-local component edges.
  const importedManifests = [
    ...(options.importedManifests ?? []),
    ...manifestBases.values()
  ];

  for (const entry of entries) {
    const filename = options.filename?.(entry) ?? entry.inputFile;
    results.push(await compileArtifactPlanEntry(entry, filename, importedManifests, options.serverComponents ?? false, options.sourceMap ?? false));
  }

  return results;
}

async function compileArtifactPlanEntry(
  entry: ExactArtifactPlanEntry,
  filename: string,
  importedManifests: readonly ExactCompilerManifest[] = [],
  serverComponents = false,
  sourceMap = false
): Promise<CompileArtifactsResult> {
  const source = await readFile(entry.inputFile, "utf8");
  const base = analyzeSource(source, { filename, importedManifests });
  const client = transformSource(source, { filename, target: "client", importedManifests, serverComponents, sourceMap });
  const server = transformSource(source, { filename, target: "server", importedManifests, serverComponents, sourceMap });
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
    serverComponents: options.serverComponents
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
  const nextPlan = await createExactArtifactPlan(inputs, options);
  const diff = diffExactArtifactPlans(state.plan, nextPlan, { changedInputs });
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
    serverComponents: options.serverComponents
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

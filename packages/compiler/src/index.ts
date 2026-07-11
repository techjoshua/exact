import ts from "typescript";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type TransformOptions = {
  filename?: string;
  target?: TransformTarget;
};

export type TransformTarget = "default" | "client" | "server";

export type TransformResult = {
  code: string;
  map: null;
  filename: string;
  manifest: ExactCompilerManifest;
};

export type ExactPlacement = "server" | "client" | "isomorphic" | "unknown";

export type ExactStateEffect = {
  path: string;
  kind: "read" | "write";
  confidence: "exact" | "broad" | "unknown";
};

export type ExactTaskIR = {
  id: string;
  placement: ExactPlacement;
  requestedPlacement?: "server" | "client";
  async: boolean;
  browserEffects: boolean;
  reads: ExactStateEffect[];
  writes: ExactStateEffect[];
  diagnostics: string[];
};

export type ExactComponentIR = {
  id: string;
  name: string;
  exported: boolean;
  placement: ExactPlacement;
  clientIslandCount: number;
  tasks: ExactTaskIR[];
  splitBoundaries: string[];
  diagnostics: string[];
};

export type ExactExportIR = {
  name: string;
  kind: "component" | "value";
  placement: ExactPlacement;
};

export type ExactSymbolIR = {
  id: string;
  componentId?: string;
  exportName?: string;
  localName: string;
  generatedName: string;
  debugName: string;
  kind: "component" | "value";
  role: "root" | "server-part" | "client-island";
  target: "client" | "server" | "both";
  placement: ExactPlacement;
};

export type ExactBoundaryIR = {
  id: string;
  name: string;
  componentId?: string;
  kind: "client-island";
};

export type ExactArtifactManifest = {
  source: string;
  client: string;
  server: string;
  manifest: string;
  exports: ExactExportIR[];
  symbols: ExactSymbolIR[];
  boundaries: ExactBoundaryIR[];
};

export type ExactCompilerManifest = {
  version: 1;
  filename: string;
  components: ExactComponentIR[];
  exports: ExactExportIR[];
  symbols: ExactSymbolIR[];
  boundaries: ExactBoundaryIR[];
  artifacts?: ExactArtifactManifest;
  serverActions: Record<string, {
    id: string;
    componentId: string;
    taskId: string;
    placement: ExactPlacement;
    stateContract: {
      reads: ExactStateEffect[];
      writes: ExactStateEffect[];
    };
  }>;
  diagnostics: string[];
};

export type CompileFileOptions = TransformOptions & {
  outDir?: string;
  rootDir?: string;
  emitManifest?: boolean;
};

export type CompileFileResult = TransformResult & {
  inputFile: string;
  outputFile?: string;
  manifestFile?: string;
};

export type CompileProjectOptions = TransformOptions & {
  outDir?: string;
  rootDir?: string;
  emitManifest?: boolean;
};

export type CompileArtifactsOptions = {
  outDir: string;
  rootDir?: string;
  filename?: string;
};

export type CompileArtifactsResult = {
  inputFile: string;
  clientFile: string;
  serverFile: string;
  manifestFile: string;
  client: TransformResult;
  server: TransformResult;
  manifest: ExactCompilerManifest;
};

export type ExactArtifactPlanOptions = {
  outDir: string;
  rootDir?: string;
};

export type ExactArtifactPlan = {
  rootDir: string;
  entries: ExactArtifactPlanEntry[];
};

export type ExactArtifactPlanEntry = {
  inputFile: string;
  clientFile: string;
  serverFile: string;
  manifestFile: string;
};

export type ExactArtifactPlanDiff = {
  added: ExactArtifactPlanEntry[];
  removed: ExactArtifactPlanEntry[];
  retained: ExactArtifactPlanEntry[];
};

export type PackageExportMapOptions = {
  packageRoot: string;
  sourceRoot?: string;
  clientCondition?: string;
  serverCondition?: string;
  defaultTarget?: "client" | "server";
};

export type PackageExportEntry = {
  [condition: string]: string;
};

export type ExactArtifactTarget = "client" | "server";

export type ExactExportConditionOptions = {
  clientCondition?: string;
  serverCondition?: string;
};

export type ExactArtifactImportResolution = {
  id: string;
  target: ExactArtifactTarget;
};

export type ExactArtifactGraphOptions = PackageExportMapOptions & ClientIslandRegistryOptions;

export type ExactArtifactGraph = {
  conditions: {
    client: string[];
    server: string[];
  };
  packageExports: Record<string, PackageExportEntry>;
  clientIslands: ClientIslandRegistryEntry[];
  artifacts: ExactArtifactGraphEntry[];
};

export type ExactArtifactGraphEntry = {
  inputFile: string;
  clientFile: string;
  serverFile: string;
  manifestFile: string;
  manifest: ExactCompilerManifest;
};

export type ClientIslandRegistryOptions = {
  rootDir?: string;
};

export type ClientIslandRegistryEntry = {
  id: string;
  name: string;
  exportName: string;
  module: string;
  componentId?: string;
};

const helperModule = "@exact/core";
const elementHelper = "__exactVNode";
const fragmentHelper = "__exactFragment";
const expressionHelper = "__exactExpression";
const dynamicHelper = "__exactDynamic";
const boundaryHelper = "__exactBoundary";

type HelperNames = {
  element: string;
  fragment: string;
  expression: string;
  dynamic: string;
  boundary: string;
};

type StateSnapshotTree = Map<string, StateSnapshotTree | ts.Expression>;
type ClientIslandElementNode = ts.JsxElement | ts.JsxSelfClosingElement;
type ComponentLocalInfo = {
  names: Set<string>;
  functions: Map<string, ts.Statement>;
};

type ClientIslandCaptures = {
  values: string[];
  functions: ts.Statement[];
};

export function transform(source: string, options: TransformOptions = {}): string {
  return transformSource(source, options).code;
}

export function transformSource(source: string, options: TransformOptions = {}): TransformResult {
  const normalized = preprocessPropPunning(source);
  const filename = options.filename ?? "input.tsx";
  const target = options.target ?? "default";
  const diagnostics = validateSource(normalized, filename);
  if (diagnostics.length) {
    throw new Error(formatDiagnostics(diagnostics));
  }
  const manifest = analyzeSource(normalized, { filename });
  const semanticErrors = manifest.diagnostics.filter(diagnostic => diagnostic.startsWith("error:"));
  if (semanticErrors.length) {
    throw new Error(semanticErrors.join("\n"));
  }
  const sourceFile = ts.createSourceFile(filename, normalized, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const result = ts.transform(sourceFile, [exactJsxTransformer(target)]);
  const transformed = result.transformed[0]!;
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printed = printer.printFile(transformed as ts.SourceFile);
  result.dispose();
  return {
    code: printed,
    map: null,
    filename,
    manifest
  };
}

export function analyzeSource(source: string, options: TransformOptions = {}): ExactCompilerManifest {
  const normalized = preprocessPropPunning(source);
  const filename = options.filename ?? "input.tsx";
  const sourceFile = ts.createSourceFile(filename, normalized, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const components: ExactComponentIR[] = [];
  const exports: ExactExportIR[] = [];
  const symbols: ExactSymbolIR[] = [];
  const boundaries: ExactBoundaryIR[] = [];
  const manifestDiagnostics: string[] = [];
  const serverActions: ExactCompilerManifest["serverActions"] = {};
  const serverOnlyImports = collectServerOnlyImports(sourceFile);

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && isComponentLikeFunction(node)) {
      components.push(analyzeComponent(node.name.text, node, sourceFile, serverOnlyImports));
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  const componentByName = new Map(components.map(component => [component.name, component]));
  const componentPlacements = new Map(components.map(component => [component.name, component.placement]));
  const splitComponentTags = collectClientComponentTags(sourceFile, componentPlacements);
  const exportedNames = collectExports(sourceFile);
  for (const component of components) {
    component.exported = exportedNames.has(component.name);
  }
  for (const name of [...exportedNames].sort()) {
    const component = componentByName.get(name);
    exports.push({
      name,
      kind: component ? "component" : "value",
      placement: component?.placement ?? "unknown"
    });
  }
  symbols.push(...createRootSymbols(sourceFile, components, exports));
  symbols.push(...createClientIslandSymbols(sourceFile, components));
  boundaries.push(...createClientIslandBoundaries(sourceFile, components, splitComponentTags));

  for (const component of components) {
    for (const task of component.tasks) {
      if (task.placement === "server" || task.placement === "isomorphic") {
        serverActions[task.id] = {
          id: task.id,
          componentId: component.id,
          taskId: task.id,
          placement: task.placement,
          stateContract: {
            reads: task.reads,
            writes: task.writes
          }
        };
      }
    }
    manifestDiagnostics.push(...component.diagnostics);
  }

  return {
    version: 1,
    filename,
    components,
    exports,
    symbols,
    boundaries,
    serverActions,
    diagnostics: manifestDiagnostics
  };
}

export async function compileFile(inputFile: string, options: CompileFileOptions = {}): Promise<CompileFileResult> {
  const source = await readFile(inputFile, "utf8");
  const result = transformSource(source, { filename: options.filename ?? inputFile, target: options.target });
  const outputFile = options.outDir ? outputPathFor(inputFile, options.outDir, options.rootDir) : undefined;
  const manifestFile = outputFile && options.emitManifest ? manifestPathFor(outputFile) : undefined;

  if (outputFile) {
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, result.code);
  }
  if (manifestFile) {
    await mkdir(path.dirname(manifestFile), { recursive: true });
    await writeFile(manifestFile, `${JSON.stringify(result.manifest, null, 2)}\n`);
  }

  return {
    ...result,
    inputFile,
    outputFile,
    manifestFile
  };
}

export async function compileProject(inputs: readonly string[], options: CompileProjectOptions = {}): Promise<CompileFileResult[]> {
  const files = await collectInputFiles(inputs);
  const rootDir = options.rootDir ?? commonRoot(files);
  const results: CompileFileResult[] = [];

  for (const file of files) {
    results.push(await compileFile(file, {
      outDir: options.outDir,
      rootDir,
      target: options.target,
      emitManifest: options.emitManifest
    }));
  }

  return results;
}

export async function compileFileArtifacts(inputFile: string, options: CompileArtifactsOptions): Promise<CompileArtifactsResult> {
  const source = await readFile(inputFile, "utf8");
  const filename = options.filename ?? inputFile;
  const manifestBase = analyzeSource(source, { filename });
  const client = transformSource(source, { filename, target: "client" });
  const server = transformSource(source, { filename, target: "server" });
  const paths = artifactPathsFor(inputFile, options.outDir, options.rootDir);
  const manifest = withArtifactMetadata(manifestBase, inputFile, paths);

  await mkdir(path.dirname(paths.clientFile), { recursive: true });
  await writeFile(paths.clientFile, client.code);
  await writeFile(paths.serverFile, server.code);
  await writeFile(paths.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    inputFile,
    ...paths,
    client,
    server,
    manifest
  };
}

export async function compileProjectArtifacts(inputs: readonly string[], options: CompileArtifactsOptions): Promise<CompileArtifactsResult[]> {
  const plan = await createExactArtifactPlan(inputs, options);
  const results: CompileArtifactsResult[] = [];

  for (const entry of plan.entries) {
    results.push(await compileFileArtifacts(entry.inputFile, {
      outDir: options.outDir,
      rootDir: plan.rootDir,
      filename: options.filename
    }));
  }

  return results;
}

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

export function diffExactArtifactPlans(previous: ExactArtifactPlan, next: ExactArtifactPlan): ExactArtifactPlanDiff {
  const previousByInput = new Map(previous.entries.map(entry => [path.resolve(entry.inputFile), entry]));
  const nextByInput = new Map(next.entries.map(entry => [path.resolve(entry.inputFile), entry]));
  const added: ExactArtifactPlanEntry[] = [];
  const removed: ExactArtifactPlanEntry[] = [];
  const retained: ExactArtifactPlanEntry[] = [];

  for (const [inputFile, entry] of nextByInput) {
    if (previousByInput.has(inputFile)) retained.push(entry);
    else added.push(entry);
  }
  for (const [inputFile, entry] of previousByInput) {
    if (!nextByInput.has(inputFile)) removed.push(entry);
  }

  return {
    added: sortPlanEntries(added),
    removed: sortPlanEntries(removed),
    retained: sortPlanEntries(retained)
  };
}

export function createPackageExportMap(
  results: readonly CompileArtifactsResult[],
  options: PackageExportMapOptions
): Record<string, PackageExportEntry> {
  const clientCondition = options.clientCondition ?? "exact-client";
  const serverCondition = options.serverCondition ?? "exact-server";
  const output: Record<string, PackageExportEntry> = {};

  for (const result of results) {
    const specifier = packageExportSpecifier(result.inputFile, options.sourceRoot ?? options.packageRoot);
    const client = packageExportTarget(result.clientFile, options.packageRoot);
    const server = packageExportTarget(result.serverFile, options.packageRoot);
    output[specifier] = {
      [clientCondition]: client,
      [serverCondition]: server,
      default: options.defaultTarget === "server" ? server : client
    };
  }

  return output;
}

export function exactExportConditions(
  target: ExactArtifactTarget,
  options: ExactExportConditionOptions = {}
): string[] {
  return [target === "server" ? options.serverCondition ?? "exact-server" : options.clientCondition ?? "exact-client"];
}

export function resolveExactArtifactImport(
  source: string,
  importer: string | undefined,
  target: ExactArtifactTarget
): ExactArtifactImportResolution | null {
  if (!source.endsWith(".exact")) return null;
  const resolved = `${source}.${target}.ts`;
  return {
    id: !importer || path.isAbsolute(resolved) ? resolved : path.resolve(path.dirname(importer), resolved),
    target
  };
}

export function createExactArtifactGraph(
  results: readonly CompileArtifactsResult[],
  options: ExactArtifactGraphOptions
): ExactArtifactGraph {
  return {
    conditions: {
      client: exactExportConditions("client", options),
      server: exactExportConditions("server", options)
    },
    packageExports: createPackageExportMap(results, options),
    clientIslands: createClientIslandRegistryEntries(results, {
      rootDir: options.rootDir ?? options.packageRoot
    }),
    artifacts: results.map(result => ({
      inputFile: result.inputFile,
      clientFile: result.clientFile,
      serverFile: result.serverFile,
      manifestFile: result.manifestFile,
      manifest: result.manifest
    }))
  };
}

export function createClientIslandRegistryEntries(
  results: readonly CompileArtifactsResult[],
  options: ClientIslandRegistryOptions = {}
): ClientIslandRegistryEntry[] {
  const entries: ClientIslandRegistryEntry[] = [];

  for (const result of results) {
    const modulePath = clientRegistryModulePath(result.clientFile, options.rootDir ?? path.dirname(result.manifestFile));
    for (const symbol of result.manifest.symbols) {
      if (symbol.role !== "client-island" || symbol.target !== "client" || !symbol.exportName) continue;
      entries.push({
        id: symbol.id,
        name: symbol.generatedName,
        exportName: symbol.exportName,
        module: modulePath,
        componentId: symbol.componentId
      });
    }
  }

  return entries.sort((left, right) => left.id.localeCompare(right.id));
}

function packageExportSpecifier(inputFile: string, sourceRoot: string): string {
  const relative = slashPath(path.relative(sourceRoot, inputFile)).replace(/\.[jt]sx$/i, "");
  return relative ? `./${relative}` : ".";
}

function packageExportTarget(file: string, packageRoot: string): string {
  return `./${slashPath(path.relative(packageRoot, file))}`;
}

function sortPlanEntries(entries: ExactArtifactPlanEntry[]): ExactArtifactPlanEntry[] {
  return entries.sort((left, right) => left.inputFile.localeCompare(right.inputFile));
}

function clientRegistryModulePath(file: string, rootDir: string): string {
  const relative = slashPath(path.relative(rootDir, file));
  if (relative.startsWith(".")) return relative;
  return `./${relative}`;
}

export function preprocessPropPunning(source: string): string {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "\"" || char === "'") {
      const end = scanQuoted(source, index, char);
      output += source.slice(index, end);
      index = end;
      continue;
    }

    if (char === "`") {
      const end = scanTemplate(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }

    if (char === "/" && next === "/") {
      const end = scanLineComment(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = scanBlockComment(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }

    if (char === "<" && isTagStart(next) && next !== "/") {
      const end = scanOpeningTag(source, index);
      if (end > index) {
        output += rewritePunnedPropsInTag(source.slice(index, end));
        index = end;
        continue;
      }
    }

    output += char;
    index++;
  }

  return output;
}

function exactJsxTransformer(target: TransformTarget): ts.TransformerFactory<ts.SourceFile> {
  return context => sourceFile => {
    const factory = context.factory;
    const helpers = allocateHelperNames(sourceFile);
    const serverOnlyImports = collectServerOnlyImports(sourceFile);
    const componentPlacements = collectComponentPlacements(sourceFile, serverOnlyImports);
    const splitComponentTags = collectClientComponentTags(sourceFile, componentPlacements);
    let sawJsx = false;
    let sawBoundary = false;
    const componentStack: string[] = [];
    const componentLocalStack: ComponentLocalInfo[] = [];
    const islandCounts = new Map<string, number>();
    const clientIslandDefinitions: ts.FunctionDeclaration[] = [];
    let clientIslandDepth = 0;

    const visitor: ts.Visitor = node => {
      if (ts.isFunctionDeclaration(node) && node.name && isComponentLikeFunction(node)) {
        if (target === "server" && componentPlacements.get(node.name.text) === "client") {
          sawBoundary = true;
          return createClientComponentServerStub(sourceFile, context, helpers, node);
        }
        componentStack.push(node.name.text);
        componentLocalStack.push(collectComponentLocalInfo(node));
        const visited = ts.visitEachChild(node, visitor, context);
        componentLocalStack.pop();
        componentStack.pop();
        return visited;
      }
      if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && isThisTaskCall(node.expression)) {
        const task = analyzeTask("target-task", node.expression, sourceFile, serverOnlyImports);
        if (shouldOmitPlacement(task.placement, target)) {
          return factory.createEmptyStatement();
        }
      }
      if (ts.isJsxElement(node)) {
        sawJsx = true;
        if (
          target === "server"
          && jsxTagIsClientComponent(node.openingElement.tagName, componentPlacements)
        ) {
          const childrenProp = clientComponentChildrenProp(context, node);
          if (!jsxElementHasNoMeaningfulChildren(node) && childrenProp === undefined) {
            throw new Error(`Cannot split client component ${node.openingElement.tagName.getText(sourceFile)} with children in server target; make the client component self-closing or extract the children into a server-rendered boundary.`);
          }
          sawBoundary = true;
          return createComponentIslandBoundaryCall(sourceFile, context, helpers, node.openingElement.tagName, node.openingElement.attributes, childrenProp);
        }
        if (target === "server" && jsxElementIsClientIsland(node.openingElement.attributes)) {
          sawBoundary = true;
          return createClientIslandBoundaryCall(sourceFile, context, helpers, componentStack[componentStack.length - 1], islandCounts, node.openingElement.attributes, node.children, clientIslandCaptures(node, componentLocalStack[componentLocalStack.length - 1]));
        }
        if (target === "client" && jsxElementIsClientIsland(node.openingElement.attributes)) {
          const owner = componentStack[componentStack.length - 1];
          if (clientIslandDepth === 0 && (!owner || componentPlacements.get(owner) !== "client")) {
            clientIslandDepth++;
            recordClientIslandDefinition(sourceFile, context, visitor, helpers, owner, islandCounts, node, clientIslandDefinitions, clientIslandCaptures(node, componentLocalStack[componentLocalStack.length - 1]));
            clientIslandDepth--;
          }
          clientIslandDepth++;
          const transformed = transformJsxElement(sourceFile, node, context, visitor, helpers);
          clientIslandDepth--;
          return transformed;
        }
        return transformJsxElement(sourceFile, node, context, visitor, helpers);
      }
      if (ts.isJsxSelfClosingElement(node)) {
        sawJsx = true;
        if (target === "client" && jsxElementIsClientIsland(node.attributes)) {
          const owner = componentStack[componentStack.length - 1];
          if (clientIslandDepth === 0 && (!owner || componentPlacements.get(owner) !== "client")) {
            recordClientIslandDefinition(sourceFile, context, visitor, helpers, owner, islandCounts, node, clientIslandDefinitions, clientIslandCaptures(node, componentLocalStack[componentLocalStack.length - 1]));
          }
        }
        if (target === "server" && jsxTagIsClientComponent(node.tagName, componentPlacements)) {
          sawBoundary = true;
          return createComponentIslandBoundaryCall(sourceFile, context, helpers, node.tagName, node.attributes);
        }
        if (target === "server" && jsxElementIsClientIsland(node.attributes)) {
          sawBoundary = true;
          return createClientIslandBoundaryCall(sourceFile, context, helpers, componentStack[componentStack.length - 1], islandCounts, node.attributes, undefined, clientIslandCaptures(node, componentLocalStack[componentLocalStack.length - 1]));
        }
        return transformJsxSelfClosingElement(sourceFile, node, context, visitor, helpers);
      }
      if (ts.isJsxFragment(node)) {
        sawJsx = true;
        return transformJsxFragment(node, context, visitor, helpers);
      }
      if (ts.isCallExpression(node)) {
        if (isThisTaskCall(node)) {
          const task = analyzeTask("target-task", node, sourceFile, serverOnlyImports);
          if (shouldOmitPlacement(task.placement, target)) {
            return factory.createVoidExpression(factory.createNumericLiteral(0));
          }
        }
        return transformCapturedCall(sourceFile, node, context, visitor);
      }
      if (ts.isTaggedTemplateExpression(node)) {
        return transformReactiveTaggedTemplate(node, context, visitor);
      }
      return ts.visitEachChild(node, visitor, context);
    };

    const transformInput = target === "client"
      ? factory.updateSourceFile(sourceFile, sourceFile.statements.filter(statement => !isServerOnlyImportDeclaration(statement)))
      : sourceFile;
    const transformed = ts.visitEachChild(transformInput, visitor, context);
    const withIslands = target === "client" && clientIslandDefinitions.length
      ? factory.updateSourceFile(transformed, [...transformed.statements, ...clientIslandDefinitions])
      : transformed;
    const visited = target === "default" ? withIslands : pruneUnusedImports(withIslands, factory);
    if (!sawJsx && !sawBoundary) return visited;

    const importDeclaration = factory.createImportDeclaration(
      undefined,
      factory.createImportClause(
        false,
        undefined,
        factory.createNamedImports([
          factory.createImportSpecifier(false, factory.createIdentifier("createCompiledVNode"), factory.createIdentifier(helpers.element)),
          factory.createImportSpecifier(false, factory.createIdentifier("createCompiledFragment"), factory.createIdentifier(helpers.fragment)),
          factory.createImportSpecifier(false, factory.createIdentifier("createExpression"), factory.createIdentifier(helpers.expression)),
          factory.createImportSpecifier(false, factory.createIdentifier("createDynamicChild"), factory.createIdentifier(helpers.dynamic)),
          ...(sawBoundary
            ? [factory.createImportSpecifier(false, factory.createIdentifier("createServerBoundary"), factory.createIdentifier(helpers.boundary))]
            : [])
        ])
      ),
      factory.createStringLiteral(helperModule)
    );

    return factory.updateSourceFile(visited, insertAfterDirectivePrologue(visited.statements, importDeclaration));
  };
}

function analyzeComponent(
  name: string,
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  serverOnlyImports: Set<string>
): ExactComponentIR {
  const tasks: ExactTaskIR[] = [];
  const splitBoundaries = new Set<string>();
  const diagnostics: string[] = [];
  const browserGlobalsOutsideClientBoundary = new Set<string>();
  let hasClientEffect = false;
  let hasServerEffect = false;
  let clientIslandCount = 0;
  let taskIndex = 0;

  function visit(current: ts.Node, islandDepth = 0, taskDepth = 0): void {
    if (ts.isCallExpression(current) && isThisTaskCall(current)) {
      const task = analyzeTask(`${name}:task:${taskIndex++}`, current, sourceFile, serverOnlyImports);
      tasks.push(task);
      if (task.placement === "client") hasClientEffect = true;
      if (task.placement === "server") hasServerEffect = true;
      if (task.placement === "isomorphic") {
        hasClientEffect = true;
        hasServerEffect = true;
      }
      diagnostics.push(...task.diagnostics);
      ts.forEachChild(current, child => visit(child, islandDepth, taskDepth + 1));
      return;
    }

    const isIslandElement = ts.isJsxElement(current) && jsxElementIsClientIsland(current.openingElement.attributes);
    const isIslandNode = isIslandElement || (ts.isJsxSelfClosingElement(current) && jsxElementIsClientIsland(current.attributes));
    if (islandDepth === 0 && isIslandNode) {
      clientIslandCount++;
      if (containsServerOnlyIdentifier(current, serverOnlyImports)) {
        diagnostics.push("error: client island cannot reference server-only imports");
      }
    }

    if (ts.isJsxAttribute(current)) {
      const propName = current.name.getText(sourceFile);
      if (/^on[A-Z]/.test(propName) || propName === "ref") {
        hasClientEffect = true;
        splitBoundaries.add(propName === "ref" ? "ref" : "event-handler");
      }
    }

    if (ts.isIdentifier(current)) {
      if (browserGlobals.has(current.text)) {
        hasClientEffect = true;
        splitBoundaries.add(`browser:${current.text}`);
        if (islandDepth === 0 && taskDepth === 0) {
          browserGlobalsOutsideClientBoundary.add(current.text);
        }
      }
      if (serverOnlyImports.has(current.text)) {
        hasServerEffect = true;
        splitBoundaries.add(`server-import:${current.text}`);
      }
    }

    ts.forEachChild(current, child => visit(child, isIslandNode ? islandDepth + 1 : islandDepth, taskDepth));
  }

  visit(node);

  const placement: ExactPlacement = hasClientEffect && hasServerEffect
    ? "isomorphic"
    : hasServerEffect
      ? "server"
      : hasClientEffect
        ? "client"
        : "server";

  if (hasServerEffect) {
    for (const global of [...browserGlobalsOutsideClientBoundary].sort()) {
      diagnostics.push(`error: browser-only global ${global} cannot be used in server-rendered component code; move it into a client island or client task`);
    }
  }

  return {
    id: stableId(sourceFile.fileName, name),
    name,
    exported: false,
    placement,
    clientIslandCount,
    tasks,
    splitBoundaries: [...splitBoundaries].sort(),
    diagnostics
  };
}

function containsServerOnlyIdentifier(node: ts.Node, serverOnlyImports: Set<string>): boolean {
  if (!serverOnlyImports.size) return false;
  let found = false;
  function visit(current: ts.Node): void {
    if (found) return;
    if (ts.isIdentifier(current) && serverOnlyImports.has(current.text)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function collectComponentPlacements(sourceFile: ts.SourceFile, serverOnlyImports: Set<string>): Map<string, ExactPlacement> {
  const placements = new Map<string, ExactPlacement>();

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && isComponentLikeFunction(node)) {
      placements.set(node.name.text, analyzeComponent(node.name.text, node, sourceFile, serverOnlyImports).placement);
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return placements;
}

function collectClientComponentTags(sourceFile: ts.SourceFile, placements: Map<string, ExactPlacement>): Set<string> {
  const tags = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isJsxSelfClosingElement(node) && jsxTagIsClientComponent(node.tagName, placements)) {
      tags.add(node.tagName.getText(sourceFile));
    }
    if (
      ts.isJsxElement(node)
      && jsxElementHasNoMeaningfulChildren(node)
      && jsxTagIsClientComponent(node.openingElement.tagName, placements)
    ) {
      tags.add(node.openingElement.tagName.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return tags;
}

function analyzeTask(
  seed: string,
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  serverOnlyImports: Set<string>
): ExactTaskIR {
  const work = node.arguments[node.arguments.length - 1];
  const reads: ExactStateEffect[] = [];
  const writes: ExactStateEffect[] = [];
  const diagnostics: string[] = [];
  let browserEffects = false;
  let serverEffects = false;
  let isAsync = false;
  const requestedPlacement = taskRequestedPlacement(node);

  if (!work || !isFunctionLikeExpression(work)) {
    return {
      id: stableId(sourceFile.fileName, seed),
      placement: "unknown",
      requestedPlacement,
      async: false,
      browserEffects: false,
      reads,
      writes,
      diagnostics: ["task work callback could not be analyzed"]
    };
  }

  isAsync = ts.canHaveModifiers(work)
    ? Boolean(ts.getModifiers(work)?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword))
    : false;

  function visit(current: ts.Node): void {
    if (ts.isIdentifier(current)) {
      if (browserGlobals.has(current.text)) browserEffects = true;
      if (serverOnlyImports.has(current.text)) serverEffects = true;
    }

    if (ts.isPropertyAccessExpression(current) && isThisStateAccess(current.expression)) {
      reads.push({
        path: current.name.text,
        kind: "read",
        confidence: "exact"
      });
    }

    if (ts.isBinaryExpression(current) && isAssignmentOperator(current.operatorToken.kind)) {
      const target = current.left;
      if (isStatePathExpression(target)) {
        writes.push({
          path: statePath(target),
          kind: "write",
          confidence: statePath(target).includes("*") ? "broad" : "exact"
        });
      }
      visit(current.right);
      return;
    }

    if (ts.isCallExpression(current)) {
      const expression = current.expression;
      if (ts.isPropertyAccessExpression(expression)) {
        if (isThisStateAccess(expression.expression) || isStatePathExpression(expression.expression)) {
          const method = expression.name.text;
          if (mutatingStateMethods.has(method)) {
            writes.push({
              path: statePath(expression.expression),
              kind: "write",
              confidence: "broad"
            });
          }
        }
        if (expression.name.text === "assign" && expression.expression.getText(sourceFile) === "Object") {
          const target = current.arguments[0];
          if (target && isStatePathExpression(target)) {
            writes.push({
              path: statePath(target),
              kind: "write",
              confidence: "broad"
            });
          }
        }
      }
    }

    ts.forEachChild(current, visit);
  }

  visit(work);

  if (browserEffects && writes.length) {
    diagnostics.push("task writes component state and references browser-only globals; classify as client and split at this boundary");
  }
  if (!browserEffects && !serverEffects && !writes.length) {
    diagnostics.push("task has no detected state writes or environment-specific effects; classify as client lifecycle work");
  }

  const inferredPlacement: ExactPlacement = browserEffects
    ? "client"
    : serverEffects
      ? "server"
      : writes.length
        ? "isomorphic"
        : "client";
  if (requestedPlacement === "server" && browserEffects) {
    diagnostics.push("error: this.task.server() cannot reference browser-only globals");
  }
  if (requestedPlacement === "client" && serverEffects) {
    diagnostics.push("error: this.task.client() cannot reference server-only imports");
  }
  if (requestedPlacement) {
    diagnostics.push(`task placement forced by this.task.${requestedPlacement}()`);
  }

  return {
    id: stableId(sourceFile.fileName, seed),
    placement: requestedPlacement ?? inferredPlacement,
    requestedPlacement,
    async: isAsync,
    browserEffects,
    reads: uniqueEffects(reads),
    writes: uniqueEffects(writes),
    diagnostics
  };
}

function isComponentLikeFunction(node: ts.FunctionDeclaration): boolean {
  const first = node.name?.text[0];
  return !!first && first === first.toUpperCase();
}

function collectExports(sourceFile: ts.SourceFile): Set<string> {
  const exports = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (hasExportModifier(statement)) {
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
        exports.add(statement.name.text);
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) exports.add(declaration.name.text);
        }
      }
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        exports.add(element.name.text);
      }
    }
  }

  return exports;
}

function createRootSymbols(sourceFile: ts.SourceFile, components: ExactComponentIR[], exports: ExactExportIR[]): ExactSymbolIR[] {
  const exportByName = new Map(exports.map(item => [item.name, item]));
  return components
    .filter(component => component.exported)
    .map(component => {
      const exported = exportByName.get(component.name);
      return {
        id: stableId(sourceFile.fileName, "symbol", component.id, "root"),
        componentId: component.id,
        exportName: exported?.name,
        localName: component.name,
        generatedName: component.name,
        debugName: component.name,
        kind: "component",
        role: "root",
        target: component.placement === "client" ? "client" : component.placement === "server" ? "server" : "both",
        placement: component.placement
      };
    });
}

function createClientIslandSymbols(sourceFile: ts.SourceFile, components: ExactComponentIR[]): ExactSymbolIR[] {
  const symbols: ExactSymbolIR[] = [];
  for (const component of components) {
    if (!component.exported) continue;
    for (let index = 1; index <= component.clientIslandCount; index++) {
      const generatedName = generatedComponentName(component.name, "client-island", index);
      symbols.push({
        id: stableId(sourceFile.fileName, component.name, "client-island", String(index)),
        componentId: component.id,
        exportName: generatedName,
        localName: generatedName,
        generatedName,
        debugName: `${component.name}:client-island:${index}`,
        kind: "component",
        role: "client-island",
        target: "client",
        placement: "client"
      });
    }
  }
  return symbols;
}

function createClientIslandBoundaries(
  sourceFile: ts.SourceFile,
  components: ExactComponentIR[],
  splitComponentTags: Set<string>
): ExactBoundaryIR[] {
  const boundaries: ExactBoundaryIR[] = [];
  const seen = new Set<string>();
  const componentByName = new Map(components.map(component => [component.name, component]));
  for (const component of components) {
    for (let index = 1; index <= component.clientIslandCount; index++) {
      const id = stableId(sourceFile.fileName, component.name, "client-island", String(index));
      seen.add(id);
      boundaries.push({
        id: stableId(sourceFile.fileName, component.name, "client-island", String(index)),
        name: generatedComponentName(component.name, "client-island", index),
        componentId: component.id,
        kind: "client-island"
      });
    }
    if (component.exported && component.placement === "client") {
      const id = stableId(sourceFile.fileName, component.name, "component-island");
      if (!seen.has(id)) {
        seen.add(id);
        boundaries.push({
          id,
          name: component.name,
          componentId: component.id,
          kind: "client-island"
        });
      }
    }
  }
  for (const name of [...splitComponentTags].sort()) {
    const id = stableId(sourceFile.fileName, name, "component-island");
    if (seen.has(id)) continue;
    seen.add(id);
    boundaries.push({
      id,
      name,
      componentId: componentByName.get(name)?.id,
      kind: "client-island"
    });
  }
  return boundaries;
}

export function generatedComponentName(authorName: string, role: "server-part" | "client-island", index: number): string {
  const base = sanitizeIdentifier(authorName || "Component");
  const suffix = role === "server-part" ? "ExactServer" : "ExactClient";
  return `${base}_${suffix}_${index}`;
}

function sanitizeIdentifier(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_$]/g, "_");
  if (/^[A-Za-z_$]/.test(cleaned)) return cleaned;
  return `_${cleaned}`;
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? Boolean(ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
    : false;
}

const browserGlobals = new Set(["window", "document", "localStorage", "sessionStorage", "navigator", "HTMLElement", "Node"]);
const mutatingStateMethods = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "set", "delete", "clear"]);

function collectServerOnlyImports(sourceFile: ts.SourceFile): Set<string> {
  const imports = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!isServerOnlyModule(statement.moduleSpecifier.text)) continue;

    const clause = statement.importClause;
    if (clause?.name) imports.add(clause.name.text);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        imports.add(element.name.text);
      }
    }
    if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      imports.add(clause.namedBindings.name.text);
    }
  }

  return imports;
}

function isServerOnlyImportDeclaration(statement: ts.Statement): boolean {
  return ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier)
    && isServerOnlyModule(statement.moduleSpecifier.text);
}

function isServerOnlyModule(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  return ["fs", "path", "crypto", "http", "https", "net", "tls", "child_process"].includes(specifier);
}

function shouldOmitPlacement(placement: ExactPlacement, target: TransformTarget): boolean {
  if (target === "default") return false;
  if (target === "client") return placement === "server";
  return placement === "client";
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function isThisStateAccess(expression: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(expression)
    && expression.name.text === "state"
    && expression.expression.kind === ts.SyntaxKind.ThisKeyword;
}

function isStatePathExpression(expression: ts.Expression): boolean {
  if (isThisStateAccess(expression)) return true;
  if (ts.isPropertyAccessExpression(expression)) return isStatePathExpression(expression.expression);
  if (ts.isElementAccessExpression(expression)) return isStatePathExpression(expression.expression);
  return false;
}

function statePath(expression: ts.Expression): string {
  if (isThisStateAccess(expression)) return "*";
  if (ts.isPropertyAccessExpression(expression) && isStatePathExpression(expression.expression)) {
    const parent = statePath(expression.expression);
    return parent === "*" ? expression.name.text : `${parent}.${expression.name.text}`;
  }
  if (ts.isElementAccessExpression(expression) && isStatePathExpression(expression.expression)) {
    const parent = statePath(expression.expression);
    const argument = expression.argumentExpression;
    const segment = argument && ts.isStringLiteralLike(argument) ? argument.text : "*";
    return parent === "*" ? segment : `${parent}.${segment}`;
  }
  return "*";
}

function uniqueEffects(effects: ExactStateEffect[]): ExactStateEffect[] {
  const seen = new Set<string>();
  const output: ExactStateEffect[] = [];
  for (const effect of effects) {
    const key = `${effect.kind}:${effect.path}:${effect.confidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(effect);
  }
  return output.sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}

function stableId(...parts: string[]): string {
  const input = parts.join(":");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `x${(hash >>> 0).toString(36)}`;
}

function transformJsxElement(sourceFile: ts.SourceFile, node: ts.JsxElement, context: ts.TransformationContext, visitor: ts.Visitor, helpers: HelperNames): ts.Expression {
  const opening = node.openingElement;
  const tagName = opening.tagName.getText();
  if (tagName === "_") {
    return callFragment(context, opening.attributes, node.children, visitor, helpers);
  }

  return callElement(context, tagExpression(opening.tagName), opening.attributes, node.children, visitor, helpers, exactElementId(sourceFile, opening.tagName, node));
}

function transformJsxSelfClosingElement(sourceFile: ts.SourceFile, node: ts.JsxSelfClosingElement, context: ts.TransformationContext, visitor: ts.Visitor, helpers: HelperNames): ts.Expression {
  const tagName = node.tagName.getText();
  if (tagName === "_") {
    return callFragment(context, node.attributes, [], visitor, helpers);
  }

  return callElement(context, tagExpression(node.tagName), node.attributes, [], visitor, helpers, exactElementId(sourceFile, node.tagName, node));
}

function transformJsxFragment(node: ts.JsxFragment, context: ts.TransformationContext, visitor: ts.Visitor, helpers: HelperNames): ts.Expression {
  return callFragment(context, undefined, node.children, visitor, helpers);
}

function pruneUnusedImports(sourceFile: ts.SourceFile, factory: ts.NodeFactory): ts.SourceFile {
  const used = collectUsedIdentifiers(sourceFile);
  const statements: ts.Statement[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      statements.push(statement);
      continue;
    }

    const clause = statement.importClause;
    const defaultName = clause.name && used.has(clause.name.text) ? clause.name : undefined;
    let namedBindings: ts.NamedImportBindings | undefined;
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      namedBindings = used.has(clause.namedBindings.name.text) ? clause.namedBindings : undefined;
    } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      const elements = clause.namedBindings.elements.filter(element => used.has(element.name.text));
      if (elements.length) {
        namedBindings = factory.updateNamedImports(clause.namedBindings, elements);
      }
    }

    if (!defaultName && !namedBindings) continue;
    statements.push(factory.updateImportDeclaration(
      statement,
      statement.modifiers,
      factory.updateImportClause(clause, clause.isTypeOnly, defaultName, namedBindings),
      statement.moduleSpecifier,
      statement.attributes
    ));
  }

  return factory.updateSourceFile(sourceFile, statements);
}

function collectUsedIdentifiers(sourceFile: ts.SourceFile): Set<string> {
  const used = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node)) used.add(node.text);
    ts.forEachChild(node, visit);
  }

  for (const statement of sourceFile.statements) visit(statement);
  return used;
}

function jsxElementIsClientIsland(attributes: ts.JsxAttributes): boolean {
  return attributes.properties.some(property => {
    if (ts.isJsxSpreadAttribute(property)) return false;
    const name = property.name.getText();
    return /^on[A-Z]/.test(name) || name === "ref";
  });
}

function collectComponentLocalInfo(node: ts.FunctionDeclaration): ComponentLocalInfo {
  const names = new Set<string>();
  const functions = new Map<string, ts.Statement>();
  function visit(current: ts.Node): void {
    if (current !== node && ts.isFunctionDeclaration(current) && current.name) {
      names.add(current.name.text);
      functions.set(current.name.text, current);
      return;
    }
    if (current !== node && (ts.isFunctionLike(current) || ts.isClassLike(current))) return;
    if (ts.isVariableDeclaration(current)) {
      collectBindingNames(current.name, names);
      if (ts.isIdentifier(current.name) && current.initializer && isFunctionLikeExpression(current.initializer)) {
        functions.set(current.name.text, cloneableFunctionVariable(current.name, current.initializer));
      }
    }
    ts.forEachChild(current, visit);
  }
  if (node.body) visit(node.body);
  return { names, functions };
}

function cloneableFunctionVariable(name: ts.Identifier, initializer: ts.Expression): ts.VariableStatement {
  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList([
      ts.factory.createVariableDeclaration(name, undefined, undefined, initializer)
    ], ts.NodeFlags.Const)
  );
}

function collectBindingNames(name: ts.BindingName, output: Set<string>): void {
  if (ts.isIdentifier(name)) {
    output.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) collectBindingNames(element.name, output);
  }
}

function clientIslandCaptures(node: ClientIslandElementNode, locals: ComponentLocalInfo | undefined): ClientIslandCaptures {
  if (!locals?.names.size) return { values: [], functions: [] };
  const captures = new Set<string>();
  collectCapturedIdentifiers(node, locals.names, captures);
  const values: string[] = [];
  const functions: ts.Statement[] = [];
  for (const name of [...captures].sort()) {
    const declaration = locals.functions.get(name);
    if (declaration) functions.push(declaration);
    else values.push(name);
  }
  return { values, functions };
}

function collectCapturedIdentifiers(node: ts.Node, locals: Set<string>, captures: Set<string>): void {
  if (ts.isIdentifier(node) && locals.has(node.text) && !isIdentifierDeclarationName(node) && !isPropertyAccessName(node)) {
    captures.add(node.text);
  }
  ts.forEachChild(node, child => collectCapturedIdentifiers(child, locals, captures));
}

function isIdentifierDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return !!parent && (
    (ts.isVariableDeclaration(parent) && parent.name === node)
    || (ts.isParameter(parent) && parent.name === node)
    || (ts.isFunctionDeclaration(parent) && parent.name === node)
    || (ts.isBindingElement(parent) && parent.name === node)
  );
}

function isPropertyAccessName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return !!parent && ts.isPropertyAccessExpression(parent) && parent.name === node;
}

function createClientIslandBoundaryCall(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  helpers: HelperNames,
  componentName: string | undefined,
  islandCounts: Map<string, number>,
  attributes: ts.JsxAttributes,
  children?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  captures: ClientIslandCaptures = emptyClientIslandCaptures()
): ts.Expression {
  const factory = context.factory;
  const owner = componentName ?? "Anonymous";
  const next = (islandCounts.get(owner) ?? 0) + 1;
  islandCounts.set(owner, next);
  const generatedName = generatedComponentName(owner, "client-island", next);
  const id = stableId(sourceFile.fileName, owner, "client-island", String(next));
  return factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
    factory.createStringLiteral(id),
    factory.createStringLiteral(generatedName),
    islandProps(context, attributes, children, captures.values)
  ]);
}

function recordClientIslandDefinition(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  helpers: HelperNames,
  componentName: string | undefined,
  islandCounts: Map<string, number>,
  node: ClientIslandElementNode,
  definitions: ts.FunctionDeclaration[],
  captures: ClientIslandCaptures = emptyClientIslandCaptures()
): void {
  const owner = componentName ?? "Anonymous";
  const next = (islandCounts.get(owner) ?? 0) + 1;
  islandCounts.set(owner, next);
  definitions.push(createClientIslandDefinition(sourceFile, context, visitor, helpers, owner, next, node, captures));
}

function createClientIslandDefinition(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  helpers: HelperNames,
  owner: string,
  index: number,
  node: ClientIslandElementNode,
  captures: ClientIslandCaptures
): ts.FunctionDeclaration {
  const factory = context.factory;
  const props = factory.createIdentifier("props");
  const generatedName = generatedComponentName(owner, "client-island", index);
  const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  const attributes = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
  const children = ts.isJsxElement(node) ? node.children : [];
  return factory.createFunctionDeclaration(
    [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    undefined,
    factory.createIdentifier(generatedName),
    undefined,
    [factory.createParameterDeclaration(
      undefined,
      undefined,
      props,
      undefined,
      undefined,
      factory.createObjectLiteralExpression([], false)
    )],
    undefined,
    factory.createBlock([
      ...capturedFunctionDeclarations(context, captures.functions, props, captures.values),
      createClientIslandStateInit(factory, props),
      factory.createReturnStatement(factory.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        factory.createCallExpression(factory.createIdentifier(helpers.element), undefined, [
          tagExpression(tagName),
          clientIslandElementProps(sourceFile, context, tagName, attributes, node, props, captures.values),
          ...clientIslandChildrenExpressions(context, children, visitor, helpers, props, captures.values)
        ])
      ))
    ], true)
  );
}

function createClientIslandStateInit(factory: ts.NodeFactory, props: ts.Identifier): ts.Statement {
  return factory.createIfStatement(
    factory.createPropertyAccessExpression(props, "__exactState"),
    factory.createExpressionStatement(factory.createCallExpression(
      factory.createPropertyAccessExpression(factory.createIdentifier("Object"), "assign"),
      undefined,
      [
        factory.createPropertyAccessExpression(factory.createThis(), "state"),
        factory.createPropertyAccessExpression(props, "__exactState")
      ]
    ))
  );
}

function clientIslandElementProps(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  tagName: ts.JsxTagNameExpression,
  attributes: ts.JsxAttributes,
  node: ts.Node,
  props: ts.Identifier,
  captures: readonly string[]
): ts.ObjectLiteralExpression {
  const factory = context.factory;
  const properties: ts.ObjectLiteralElementLike[] = [];
  const exactId = exactElementId(sourceFile, tagName, node);
  if (exactId) {
    properties.push(factory.createPropertyAssignment(factory.createStringLiteral("data-exact-id"), factory.createStringLiteral(exactId)));
  }
  for (const attribute of attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) {
      properties.push(factory.createSpreadAssignment(props));
      continue;
    }
    const name = attribute.name.getText(sourceFile);
    if (!attribute.initializer) {
      properties.push(factory.createPropertyAssignment(propName(name), factory.createPropertyAccessExpression(props, name)));
      continue;
    }
    if (/^on[A-Z]/.test(name) || name === "ref") {
      if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
        properties.push(factory.createPropertyAssignment(propName(name), rewriteCapturedNode(context, attribute.initializer.expression, props, captures)));
      }
      continue;
    }
    properties.push(factory.createPropertyAssignment(propName(name), factory.createPropertyAccessExpression(props, name)));
  }
  return factory.createObjectLiteralExpression(properties, false);
}

function clientIslandChildrenExpressions(
  context: ts.TransformationContext,
  children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  visitor: ts.Visitor,
  helpers: HelperNames,
  props: ts.Identifier,
  captures: readonly string[]
): ts.Expression[] {
  const rewritten = children.map(child => rewriteCapturedNode(context, child, props, captures));
  return childrenExpressions(context, rewritten, visitor, helpers);
}

function rewriteCapturedNode<T extends ts.Node>(
  context: ts.TransformationContext,
  node: T,
  props: ts.Identifier,
  captures: readonly string[]
): T {
  if (!captures.length) return node;
  const captureSet = new Set(captures);
  const visitor: ts.Visitor = current => {
    if (ts.isIdentifier(current) && captureSet.has(current.text) && !isIdentifierDeclarationName(current) && !isPropertyAccessName(current)) {
      return context.factory.createPropertyAccessExpression(
        context.factory.createPropertyAccessExpression(props, "__exactCapture"),
        current.text
      );
    }
    return ts.visitEachChild(current, visitor, context);
  };
  return ts.visitNode(node, visitor) as T;
}

function capturedFunctionDeclarations(
  context: ts.TransformationContext,
  functions: readonly ts.Statement[],
  props: ts.Identifier,
  captures: readonly string[]
): ts.Statement[] {
  return functions.map(fn => rewriteCapturedNode(context, fn, props, captures));
}

function emptyClientIslandCaptures(): ClientIslandCaptures {
  return { values: [], functions: [] };
}

function createComponentIslandBoundaryCall(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  helpers: HelperNames,
  tagName: ts.JsxTagNameExpression,
  attributes: ts.JsxAttributes,
  children?: ts.Expression
): ts.Expression {
  const factory = context.factory;
  const componentName = tagName.getText(sourceFile);
  const id = stableId(sourceFile.fileName, componentName, "component-island");
  const props = islandProps(context, attributes);
  return factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
    factory.createStringLiteral(id),
    factory.createStringLiteral(componentName),
    children === undefined ? props : appendObjectProperty(context, props, "children", children)
  ]);
}

function createClientComponentServerStub(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  helpers: HelperNames,
  node: ts.FunctionDeclaration
): ts.FunctionDeclaration {
  const factory = context.factory;
  const componentName = node.name!.text;
  const props = factory.createIdentifier("props");
  const id = stableId(sourceFile.fileName, componentName, "component-island");
  return factory.updateFunctionDeclaration(
    node,
    node.modifiers,
    node.asteriskToken,
    node.name,
    undefined,
    [
      factory.createParameterDeclaration(
        undefined,
        undefined,
        props,
        undefined,
        undefined,
        factory.createObjectLiteralExpression([], false)
      )
    ],
    undefined,
    factory.createBlock([
      factory.createReturnStatement(factory.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
          factory.createStringLiteral(id),
          factory.createStringLiteral(componentName),
          props
        ])
      ))
    ], true)
  );
}

function islandProps(
  context: ts.TransformationContext,
  attributes: ts.JsxAttributes,
  children?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  captures: readonly string[] = []
): ts.ObjectLiteralExpression {
  const props: ts.ObjectLiteralElementLike[] = [];
  const factory = context.factory;
  const stateReads = collectIslandStateReads(attributes, children);
  if (stateReads.length) {
    props.push(factory.createPropertyAssignment(
      factory.createStringLiteral("__exactState"),
      stateSnapshotObject(factory, stateReads)
    ));
  }
  if (captures.length) {
    props.push(factory.createPropertyAssignment(
      factory.createStringLiteral("__exactCapture"),
      factory.createObjectLiteralExpression(captures.map(name => factory.createPropertyAssignment(propName(name), factory.createIdentifier(name))), false)
    ));
  }
  for (const attribute of attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) {
      props.push(factory.createSpreadAssignment(attribute.expression));
      continue;
    }
    const name = attribute.name.getText();
    if (/^on[A-Z]/.test(name) || name === "ref") continue;
    if (!attribute.initializer) {
      props.push(factory.createPropertyAssignment(propName(name), factory.createTrue()));
      continue;
    }
    if (ts.isStringLiteral(attribute.initializer)) {
      props.push(factory.createPropertyAssignment(propName(name), factory.createStringLiteral(attribute.initializer.text)));
      continue;
    }
    if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      const expression = attribute.initializer.expression;
      props.push(factory.createPropertyAssignment(propName(name), expression));
    }
  }
  return factory.createObjectLiteralExpression(props, false);
}

function collectIslandStateReads(attributes: ts.JsxAttributes, children?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[]): string[] {
  const paths = new Set<string>();
  for (const attribute of attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) {
      collectStateReads(attribute.expression, paths);
      continue;
    }
    if (attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      collectStateReads(attribute.initializer.expression, paths);
    }
  }
  for (const child of children ?? []) {
    collectStateReads(child, paths);
  }
  return [...paths].sort();
}

function collectStateReads(node: ts.Node, paths: Set<string>): void {
  if (ts.isPropertyAccessExpression(node) && isStatePathExpression(node)) {
    const path = statePath(node);
    if (path !== "*") paths.add(path);
  }
  ts.forEachChild(node, child => collectStateReads(child, paths));
}

function stateSnapshotObject(factory: ts.NodeFactory, paths: readonly string[]): ts.ObjectLiteralExpression {
  const root: StateSnapshotTree = new Map();
  for (const path of paths) {
    let cursor = root;
    const segments = path.split(".");
    for (const segment of segments.slice(0, -1)) {
      if (!cursor.has(segment)) cursor.set(segment, new Map());
      const next = cursor.get(segment);
      if (!(next instanceof Map)) break;
      cursor = next;
    }
    cursor.set(segments[segments.length - 1]!, stateAccessExpression(factory, segments));
  }
  return mapToObjectLiteral(factory, root);
}

function mapToObjectLiteral(factory: ts.NodeFactory, map: StateSnapshotTree): ts.ObjectLiteralExpression {
  return factory.createObjectLiteralExpression([...map.entries()].map(([name, value]) => factory.createPropertyAssignment(
    propName(name),
    value instanceof Map ? mapToObjectLiteral(factory, value) : value
  )), false);
}

function appendObjectProperty(
  context: ts.TransformationContext,
  object: ts.ObjectLiteralExpression,
  name: string,
  value: ts.Expression
): ts.ObjectLiteralExpression {
  return context.factory.updateObjectLiteralExpression(object, [
    ...object.properties,
    context.factory.createPropertyAssignment(propName(name), value)
  ]);
}

function stateAccessExpression(factory: ts.NodeFactory, segments: readonly string[]): ts.Expression {
  let expression: ts.Expression = factory.createPropertyAccessExpression(factory.createThis(), "state");
  for (const segment of segments) {
    expression = factory.createPropertyAccessExpression(expression, segment);
  }
  return expression;
}

function jsxTagIsClientComponent(tagName: ts.JsxTagNameExpression, placements: Map<string, ExactPlacement>): boolean {
  if (!ts.isIdentifier(tagName)) return false;
  if (/^[a-z]/.test(tagName.text)) return false;
  return placements.get(tagName.text) === "client";
}

function exactElementId(sourceFile: ts.SourceFile, tagName: ts.JsxTagNameExpression, node: ts.Node): string | undefined {
  if (!jsxTagIsIntrinsicElement(tagName)) return undefined;
  return stableId(sourceFile.fileName, "element", String(node.getStart(sourceFile)), String(node.getEnd()));
}

function jsxTagIsIntrinsicElement(tagName: ts.JsxTagNameExpression): boolean {
  if (ts.isIdentifier(tagName)) return /^[a-z]/.test(tagName.text);
  return ts.isJsxNamespacedName(tagName);
}

function jsxElementHasNoMeaningfulChildren(node: ts.JsxElement): boolean {
  return node.children.every(child => ts.isJsxText(child) && !child.text.trim());
}

function clientComponentChildrenProp(context: ts.TransformationContext, node: ts.JsxElement): ts.Expression | undefined {
  const values: ts.Expression[] = [];
  let text = "";
  for (const child of node.children) {
    if (ts.isJsxText(child)) {
      text += child.text;
      continue;
    }
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized) values.push(context.factory.createStringLiteral(normalized));
    text = "";

    if (ts.isJsxExpression(child)) {
      if (!child.expression) continue;
      if (containsJsx(child.expression)) return undefined;
      values.push(child.expression);
      continue;
    }
    return undefined;
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized) values.push(context.factory.createStringLiteral(normalized));
  if (!values.length) return undefined;
  if (values.length === 1) return values[0];
  return context.factory.createArrayLiteralExpression(values, false);
}

function containsJsx(node: ts.Node): boolean {
  let found = false;
  function visit(current: ts.Node): void {
    if (found) return;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxFragment(current)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function callElement(
  context: ts.TransformationContext,
  tag: ts.Expression,
  attributes: ts.JsxAttributes | undefined,
  children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  visitor: ts.Visitor,
  helpers: HelperNames,
  exactId?: string
): ts.Expression {
  return context.factory.createCallExpression(context.factory.createIdentifier(helpers.element), undefined, [
    tag,
    propsObject(context, attributes, visitor, helpers, exactId),
    ...childrenExpressions(context, children, visitor, helpers)
  ]);
}

function callFragment(
  context: ts.TransformationContext,
  attributes: ts.JsxAttributes | undefined,
  children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  visitor: ts.Visitor,
  helpers: HelperNames
): ts.Expression {
  return context.factory.createCallExpression(context.factory.createIdentifier(helpers.fragment), undefined, [
    propsObject(context, attributes, visitor, helpers),
    ...childrenExpressions(context, children, visitor, helpers)
  ]);
}

function propsObject(context: ts.TransformationContext, attributes: ts.JsxAttributes | undefined, visitor: ts.Visitor, helpers: HelperNames, exactId?: string): ts.Expression {
  const factory = context.factory;
  const properties: ts.ObjectLiteralElementLike[] = [];
  if (exactId) {
    properties.push(factory.createPropertyAssignment(factory.createStringLiteral("data-exact-id"), factory.createStringLiteral(exactId)));
  }

  for (const property of attributes?.properties ?? []) {
    if (ts.isJsxSpreadAttribute(property)) {
      properties.push(factory.createSpreadAssignment(ts.visitNode(property.expression, visitor) as ts.Expression));
      continue;
    }

    const name = property.name.getText();
    if (!property.initializer) {
      properties.push(factory.createPropertyAssignment(propName(name), factory.createTrue()));
      continue;
    }

    if (ts.isStringLiteral(property.initializer)) {
      properties.push(factory.createPropertyAssignment(propName(name), property.initializer));
      continue;
    }

    if (ts.isJsxExpression(property.initializer)) {
      const expression = property.initializer.expression;
      if (!expression) continue;
      properties.push(factory.createPropertyAssignment(propName(name), shouldWrapAttribute(name, expression) ? wrapExpression(context, expression, visitor, helpers) : ts.visitNode(expression, visitor) as ts.Expression));
    }
  }

  return factory.createObjectLiteralExpression(properties, false);
}

function propName(name: string): ts.PropertyName {
  return /^[$A-Z_a-z][$\w]*$/.test(name)
    ? ts.factory.createIdentifier(name)
    : ts.factory.createStringLiteral(name);
}

function childrenExpressions(
  context: ts.TransformationContext,
  children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  visitor: ts.Visitor,
  helpers: HelperNames
): ts.Expression[] {
  const output: ts.Expression[] = [];

  for (const child of children) {
    if (ts.isJsxText(child)) {
      const text = child.text.replace(/\s+/g, " ");
      if (text.trim()) output.push(context.factory.createStringLiteral(text));
      continue;
    }

    if (ts.isJsxExpression(child)) {
      if (child.expression) output.push(wrapDynamicChild(context, child.expression, visitor, helpers));
      continue;
    }

    output.push(ts.visitNode(child, visitor) as ts.Expression);
  }

  return output;
}

function shouldWrapAttribute(name: string, expression: ts.Expression): boolean {
  if (name === "key") return false;
  if (name === "ref") return false;
  if (/^on[A-Z]/.test(name)) return false;
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return false;
  return true;
}

function wrapDynamicChild(context: ts.TransformationContext, expression: ts.Expression, visitor: ts.Visitor, helpers: HelperNames): ts.Expression {
  const factory = context.factory;
  return factory.createCallExpression(factory.createIdentifier(helpers.dynamic), undefined, [
    factory.createArrowFunction(
      undefined,
      undefined,
      [],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      ts.visitNode(expression, visitor) as ts.Expression
    )
  ]);
}

function wrapExpression(context: ts.TransformationContext, expression: ts.Expression, visitor: ts.Visitor, helpers: HelperNames): ts.Expression {
  const factory = context.factory;
  return factory.createCallExpression(factory.createIdentifier(helpers.expression), undefined, [
    factory.createArrowFunction(
      undefined,
      undefined,
      [],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      ts.visitNode(expression, visitor) as ts.Expression
    )
  ]);
}

function tagExpression(tagName: ts.JsxTagNameExpression): ts.Expression {
  if (ts.isIdentifier(tagName)) {
    const text = tagName.text;
    return /^[a-z]/.test(text) ? ts.factory.createStringLiteral(text) : ts.factory.createIdentifier(text);
  }

  if (ts.isPropertyAccessExpression(tagName)) {
    return ts.factory.createPropertyAccessExpression(tagExpression(tagName.expression as ts.JsxTagNameExpression), tagName.name);
  }

  return ts.factory.createStringLiteral(tagName.getText());
}

function transformCapturedCall(sourceFile: ts.SourceFile, node: ts.CallExpression, context: ts.TransformationContext, visitor: ts.Visitor): ts.Expression {
  if (isThisMethodCall(node, "reactive")) {
    return transformReactiveCall(node, context, visitor);
  }

  if (isThisTaskCall(node)) {
    return transformTaskCall(node, context, visitor);
  }

  if (isThisMethodCall(node, "map")) {
    return transformMapCall(sourceFile, node, context, visitor);
  }

  return ts.visitEachChild(node, visitor, context);
}

function transformReactiveTaggedTemplate(node: ts.TaggedTemplateExpression, context: ts.TransformationContext, visitor: ts.Visitor): ts.Expression {
  if (!isThisMethodAccess(node.tag, "reactive")) {
    return ts.visitEachChild(node, visitor, context);
  }

  return context.factory.createCallExpression(
    ts.visitNode(node.tag, visitor) as ts.Expression,
    node.typeArguments,
    [captureArgument(context, templateToExpression(node.template), visitor)]
  );
}

function transformReactiveCall(node: ts.CallExpression, context: ts.TransformationContext, visitor: ts.Visitor): ts.Expression {
  if (node.arguments.length !== 1) return ts.visitEachChild(node, visitor, context);
  const [argument] = node.arguments;
  if (!argument || isFunctionLikeExpression(argument)) return ts.visitEachChild(node, visitor, context);

  return context.factory.updateCallExpression(
    node,
    ts.visitNode(node.expression, visitor) as ts.Expression,
    node.typeArguments,
    [captureArgument(context, argument, visitor)]
  );
}

function transformTaskCall(node: ts.CallExpression, context: ts.TransformationContext, visitor: ts.Visitor): ts.Expression {
  if (node.arguments.length < 2) return ts.visitEachChild(node, visitor, context);
  const work = node.arguments[node.arguments.length - 1]!;
  if (!isFunctionLikeExpression(work)) return ts.visitEachChild(node, visitor, context);

  const nextArguments = node.arguments.map((argument, index) => {
    if (index === node.arguments.length - 1 || isFunctionLikeExpression(argument)) {
      return ts.visitNode(argument, visitor) as ts.Expression;
    }
    return context.factory.createCallExpression(
      context.factory.createPropertyAccessExpression(context.factory.createThis(), "reactive"),
      undefined,
      [captureArgument(context, argument, visitor)]
    );
  });

  return context.factory.updateCallExpression(
    node,
    ts.visitNode(node.expression, visitor) as ts.Expression,
    node.typeArguments,
    nextArguments
  );
}

function transformMapCall(sourceFile: ts.SourceFile, node: ts.CallExpression, context: ts.TransformationContext, visitor: ts.Visitor): ts.Expression {
  if (node.arguments.length !== 3) return ts.visitEachChild(node, visitor, context);
  const id = stableId(sourceFile.fileName, "list", String(node.getStart(sourceFile)), String(node.getEnd()));
  return context.factory.updateCallExpression(
    node,
    ts.visitNode(node.expression, visitor) as ts.Expression,
    node.typeArguments,
    [
      ...node.arguments.map(argument => ts.visitNode(argument, visitor) as ts.Expression),
      context.factory.createStringLiteral(id)
    ]
  );
}

function captureArgument(context: ts.TransformationContext, expression: ts.Expression, visitor: ts.Visitor): ts.ArrowFunction {
  return context.factory.createArrowFunction(
    undefined,
    undefined,
    [],
    undefined,
    context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    ts.visitNode(expression, visitor) as ts.Expression
  );
}

function isThisMethodCall(node: ts.CallExpression, methodName: string): boolean {
  return isThisMethodAccess(node.expression, methodName);
}

function isThisTaskCall(node: ts.CallExpression): boolean {
  return isThisMethodCall(node, "task") || taskRequestedPlacement(node) !== undefined;
}

function taskRequestedPlacement(node: ts.CallExpression): "server" | "client" | undefined {
  const expression = node.expression;
  if (!ts.isPropertyAccessExpression(expression)) return undefined;
  const placement = expression.name.text;
  if (placement !== "server" && placement !== "client") return undefined;
  return isThisMethodAccess(expression.expression, "task") ? placement : undefined;
}

function isThisMethodAccess(expression: ts.Expression, methodName: string): boolean {
  return ts.isPropertyAccessExpression(expression)
    && expression.name.text === methodName
    && expression.expression.kind === ts.SyntaxKind.ThisKeyword;
}

function isFunctionLikeExpression(node: ts.Expression): node is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function templateToExpression(template: ts.TemplateLiteral): ts.Expression {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return ts.factory.createStringLiteral(template.text);
  }

  return ts.factory.createTemplateExpression(
    template.head,
    template.templateSpans.map(span => ts.factory.createTemplateSpan(span.expression, span.literal))
  );
}

function allocateHelperNames(sourceFile: ts.SourceFile): HelperNames {
  const used = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) used.add(node.text);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    element: allocateName(elementHelper, used),
    fragment: allocateName(fragmentHelper, used),
    expression: allocateName(expressionHelper, used),
    dynamic: allocateName(dynamicHelper, used),
    boundary: allocateName(boundaryHelper, used)
  };
}

function allocateName(base: string, used: Set<string>): string {
  let name = base;
  let index = 1;
  while (used.has(name)) {
    name = `${base}_${index}`;
    index++;
  }
  used.add(name);
  return name;
}

function rewritePunnedPropsInTag(tag: string): string {
  let output = "";
  let index = 0;
  let braceDepth = 0;
  let quote: "\"" | "'" | undefined;

  while (index < tag.length) {
    const char = tag[index]!;

    if (quote) {
      output += char;
      if (char === "\\") {
        output += tag[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (char === quote) quote = undefined;
      index++;
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      output += char;
      index++;
      continue;
    }

    if (char === "{") {
      if (braceDepth === 0 && isWhitespace(tag[index - 1] ?? "") && isIdentifierStart(tag[index + 1] ?? "")) {
        const identifierEnd = scanIdentifier(tag, index + 1);
        if (tag[identifierEnd] === "}") {
          const name = tag.slice(index + 1, identifierEnd);
          output += `${name}={${name}}`;
          index = identifierEnd + 1;
          continue;
        }
      }
      braceDepth++;
      output += char;
      index++;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    }

    output += char;
    index++;
  }

  return output;
}

function scanOpeningTag(source: string, start: number): number {
  let index = start + 1;
  let braceDepth = 0;
  let quote: "\"" | "'" | undefined;

  while (index < source.length) {
    const char = source[index]!;

    if (quote) {
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === quote) quote = undefined;
      index++;
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      index++;
      continue;
    }

    if (char === "{") {
      braceDepth++;
      index++;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      index++;
      continue;
    }

    if (char === ">" && braceDepth === 0) return index + 1;
    index++;
  }

  return -1;
}

function scanQuoted(source: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    index++;
  }
  return source.length;
}

function scanTemplate(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "`") return index + 1;
    index++;
  }
  return source.length;
}

function scanLineComment(source: string, start: number): number {
  const end = source.indexOf("\n", start + 2);
  return end === -1 ? source.length : end;
}

function scanBlockComment(source: string, start: number): number {
  const end = source.indexOf("*/", start + 2);
  return end === -1 ? source.length : end + 2;
}

function scanIdentifier(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length && isIdentifierPart(source[index]!)) index++;
  return index;
}

function isTagStart(char: string | undefined): boolean {
  return !!char && (isIdentifierStart(char) || char === ">");
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[\w$]/.test(char);
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

function insertAfterDirectivePrologue(statements: ts.NodeArray<ts.Statement>, statement: ts.Statement): ts.Statement[] {
  const nextStatements = [...statements];
  let index = 0;
  while (index < nextStatements.length && isDirectivePrologueStatement(nextStatements[index]!)) {
    index++;
  }
  nextStatements.splice(index, 0, statement);
  return nextStatements;
}

function isDirectivePrologueStatement(statement: ts.Statement): boolean {
  return ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
}

function validateSource(source: string, filename: string): readonly ts.Diagnostic[] {
  return ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  }).diagnostics ?? [];
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return diagnostics.map(diagnostic => {
    const file = diagnostic.file;
    const location = file && diagnostic.start !== undefined
      ? file.getLineAndCharacterOfPosition(diagnostic.start)
      : undefined;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    return file && location
      ? `${file.fileName}:${location.line + 1}:${location.character + 1} - ${message}`
      : message;
  }).join("\n");
}

async function collectInputFiles(inputs: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    files.push(...await collectInput(input));
  }
  return files.sort();
}

async function collectInput(input: string): Promise<string[]> {
  const stat = await import("node:fs/promises").then(fs => fs.stat(input));
  if (!stat.isDirectory()) return isTransformablePath(input) ? [input] : [];

  const files: string[] = [];
  for (const entry of await readdir(input, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const fullPath = path.join(input, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectInput(fullPath));
    } else if (isTransformablePath(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function isTransformablePath(file: string): boolean {
  return /\.[jt]sx$/i.test(file);
}

function outputPathFor(inputFile: string, outDir: string, rootDir?: string): string {
  const root = rootDir ?? path.dirname(inputFile);
  const relative = path.relative(root, inputFile);
  return path.join(outDir, relative).replace(/\.(tsx|jsx)$/i, (_match, ext: string) => ext.toLowerCase() === "tsx" ? ".ts" : ".js");
}

function manifestPathFor(outputFile: string): string {
  return outputFile.replace(/\.[^.\\/]+$/i, ".exact.json");
}

function artifactPathsFor(inputFile: string, outDir: string, rootDir?: string): {
  clientFile: string;
  serverFile: string;
  manifestFile: string;
} {
  const root = rootDir ?? path.dirname(inputFile);
  const relative = path.relative(root, inputFile);
  const parsed = path.parse(relative);
  const extension = parsed.ext.toLowerCase() === ".tsx" ? ".ts" : ".js";
  const base = path.join(outDir, parsed.dir, parsed.name);
  return {
    clientFile: `${base}.exact.client${extension}`,
    serverFile: `${base}.exact.server${extension}`,
    manifestFile: `${base}.exact.manifest.json`
  };
}

function withArtifactMetadata(
  manifest: ExactCompilerManifest,
  inputFile: string,
  paths: { clientFile: string; serverFile: string; manifestFile: string }
): ExactCompilerManifest {
  const root = path.dirname(paths.manifestFile);
  return {
    ...manifest,
    artifacts: {
      source: slashPath(path.relative(root, inputFile)),
      client: slashPath(path.relative(root, paths.clientFile)),
      server: slashPath(path.relative(root, paths.serverFile)),
      manifest: slashPath(path.relative(root, paths.manifestFile)),
      exports: manifest.exports,
      symbols: manifest.symbols,
      boundaries: manifest.boundaries
    }
  };
}

function slashPath(value: string): string {
  return value.split(path.sep).join("/");
}

function commonRoot(files: readonly string[]): string {
  if (!files.length) return process.cwd();
  const split = files.map(file => path.dirname(path.resolve(file)).split(path.sep));
  const first = split[0]!;
  let index = 0;
  while (index < first.length && split.every(parts => parts[index] === first[index])) {
    index++;
  }
  return first.slice(0, index).join(path.sep) || path.parse(first[0] ?? process.cwd()).root;
}

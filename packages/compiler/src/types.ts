import type ts from "typescript";

export type TransformOptions = {
  filename?: string;
  target?: TransformTarget;
  importedManifests?: readonly ExactCompilerManifest[];
  serverComponents?: boolean;
  sourceMap?: boolean;
};

export type TransformTarget = "default" | "client" | "server";

export type TransformResult = {
  code: string;
  map: ExactSourceMap | null;
  filename: string;
  manifest: ExactCompilerManifest;
};

export type ExactSourceMap = {
  version: 3;
  file?: string;
  sources: string[];
  sourcesContent?: string[];
  names: string[];
  mappings: string;
};

export type ExactPlacement = "server" | "client" | "isomorphic" | "unknown";

export type ExactStateEffect = {
  path: string;
  kind: "read" | "write";
  confidence: "exact" | "broad" | "unknown";
};

export type ExactContextEffect = {
  token: string;
  kind: "read" | "write";
  confidence: "exact" | "unknown";
};

export type ExactTaskIR = {
  id: string;
  placement: ExactPlacement;
  requestedPlacement?: "server" | "client";
  async: boolean;
  browserEffects: boolean;
  reads: ExactStateEffect[];
  writes: ExactStateEffect[];
  contexts: ExactContextEffect[];
  diagnostics: string[];
};

export type ExactComponentRenderEdgeIR = {
  id: string;
  tag: string;
  name: string;
  componentId?: string;
  placement: ExactPlacement;
  boundary: ExactPlacement;
  index: number;
  path: string;
};

export type ExactComponentIR = {
  id: string;
  name: string;
  exported: boolean;
  placement: ExactPlacement;
  subgraphPlacement: ExactPlacement;
  renderEdges: ExactComponentRenderEdgeIR[];
  clientIslandCount: number;
  tasks: ExactTaskIR[];
  contexts: ExactContextEffect[];
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
  ownerComponentId?: string;
  renderEdgeId?: string;
  renderEdgeIndex?: number;
  renderPath?: string;
  kind: "client-island" | "server-slot";
};

export type ExactImportedComponentIR = {
  name: string;
  boundaryName?: string;
  placement: ExactPlacement;
  componentId?: string;
};

export type ExactSemanticScopeIR = {
  id: string;
  parentId?: string;
  kind: "module" | "function" | "block";
  nodeKind: string;
};

export type ExactSemanticDeclarationIR = {
  id: string;
  name: string;
  scopeId: string;
  kind: "import" | "function" | "class" | "variable" | "parameter" | "type" | "interface";
  nodeStart: number;
  nodeEnd: number;
  moduleSpecifier?: string;
  importedName?: string;
  typeOnly?: boolean;
  exportedName?: string;
};

export type ExactSemanticReferenceIR = {
  name: string;
  scopeId: string;
  source: "local" | "import" | "global" | "unresolved";
  nodeStart: number;
  nodeEnd: number;
  declarationId?: string;
  declarationKind?: ExactSemanticDeclarationIR["kind"];
  moduleSpecifier?: string;
  importedName?: string;
  typeOnly?: boolean;
  exportedName?: string;
};

export type ExactSemanticExportIR = {
  exportedName: string;
  localName?: string;
  importedName?: string;
  moduleSpecifier?: string;
  typeOnly?: boolean;
};

export type ExactSemanticGraphIR = {
  scopes: ExactSemanticScopeIR[];
  declarations: ExactSemanticDeclarationIR[];
  references: ExactSemanticReferenceIR[];
  exports: ExactSemanticExportIR[];
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
  semanticGraph?: ExactSemanticGraphIR;
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
    contextContract: ExactContextEffect[];
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
  sourceMapFile?: string;
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
  importedManifests?: readonly ExactCompilerManifest[];
  serverComponents?: boolean;
  sourceMap?: boolean;
};

export type CompileArtifactsResult = {
  inputFile: string;
  clientFile: string;
  serverFile: string;
  clientMapFile?: string;
  serverMapFile?: string;
  manifestFile: string;
  client: TransformResult;
  server: TransformResult;
  manifest: ExactCompilerManifest;
};

export type ExactArtifactGraphInput = {
  inputFile: string;
  clientFile: string;
  serverFile: string;
  manifestFile: string;
  manifest: ExactCompilerManifest;
};

export type CompileArtifactPlanEntriesOptions = {
  filename?(entry: ExactArtifactPlanEntry): string;
  importedManifests?: readonly ExactCompilerManifest[];
  serverComponents?: boolean;
  sourceMap?: boolean;
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
  changed: ExactArtifactPlanEntry[];
  retained: ExactArtifactPlanEntry[];
};

export type ExactArtifactPlanDiffOptions = {
  changedInputs?: readonly string[];
};

export type ExactArtifactDevStateOptions = CompileArtifactsOptions & ExactArtifactGraphOptions;

export type ExactArtifactDevState = {
  plan: ExactArtifactPlan;
  entries: ExactArtifactGraphEntry[];
  graph: ExactArtifactGraph;
};

export type ExactArtifactDevStateUpdate = ExactArtifactDevState & {
  diff: ExactArtifactPlanDiff;
  compiled: CompileArtifactsResult[];
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
  componentEdges: ExactArtifactComponentEdge[];
  clientIslands: ClientIslandRegistryEntry[];
  serverParts: ServerPartRegistryEntry[];
  artifacts: ExactArtifactGraphEntry[];
};

export type ExactArtifactComponentEdge = {
  id: string;
  sourceFile: string;
  sourceComponentId: string;
  sourceName: string;
  targetComponentId?: string;
  targetName: string;
  tag: string;
  placement: ExactPlacement;
  boundary: ExactPlacement;
  index: number;
  path: string;
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

export type ServerPartRegistryOptions = {
  rootDir?: string;
};

export type ServerPartRegistryEntry = {
  id: string;
  name: string;
  exportName: string;
  module: string;
  componentId?: string;
};

export type ExactRegistryModuleOptions = {
  exportName?: string;
};

export type ExactHydrationRegistrationModuleOptions = {
  endpoint?: string;
  endpoints?: ExactHydrationEndpointRoutes;
  islandsExportName?: string;
  registrationExportName?: string;
};

export type ExactHydrationEndpointRoutes = {
  actions?: Record<string, string>;
  boundaries?: Record<string, string>;
};

export type ExactArtifactRegistryModulesOptions = {
  clientExportName?: string;
  serverExportName?: string;
};

export type ExactArtifactRegistryModules = {
  client: string;
  server: string;
};

export type HelperNames = {
  element: string;
  fragment: string;
  expression: string;
  dynamic: string;
  derived: string;
  boundary: string;
  write: string;
  update: string;
  updateResult: string;
  abortOptions: string;
  taskSignal: string;
  taskTimeout: string;
  taskInterval: string;
  taskAnimationFrame: string;
  taskIdleCallback: string;
  taskObserver: string;
  taskFetch: string;
  taskResource: string;
  taskOptionsSignal: string;
  taskCombinedSignal: string;
  taskAwait: string;
  remove: string;
  arrayMutation: string;
};

export type StateSnapshotTree = Map<string, StateSnapshotTree | ts.Expression>;
export type ClientIslandElementNode = ts.JsxElement | ts.JsxSelfClosingElement;
export type ExportBinding = {
  exportedName: string;
  localName: string;
};

export type ClientIslandCaptures = {
  values: string[];
  functions: ts.Statement[];
  stateReads?: string[];
  serverSlotChildren?: boolean;
};

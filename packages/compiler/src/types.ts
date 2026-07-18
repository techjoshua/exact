import type ts from "typescript";
import type { ExactCompilerSession } from "./expression-project.js";
import type { ExactJsonValue, ExactPreparedCompilerRegistry } from "@exact/plugin-api";

export type TransformOptions = {
  filename?: string;
  /** Root used to resolve relative filenames; defaults to the nearest package.json from cwd. */
  root?: string;
  /** Owned incremental compiler state; direct callers use the process-default session when omitted. */
  session?: ExactCompilerSession;
  target?: TransformTarget;
  importedManifests?: readonly ExactCompilerManifest[];
  serverComponents?: boolean;
  /**
   * Preserves function-declaration hoisting while attaching component descriptors.
   * Project artifact compilation enables this automatically for import cycles.
   */
  preserveComponentHoisting?: boolean;
  sourceMap?: boolean;
  moduleRewrite?: ModuleRewriteOptions;
  moduleTransform?: ModuleTransform;
  /** Serializable rules for imports handled as build assets. */
  assetRules?: readonly ExactAssetRule[];
  /** Keeps client asset edges for a host bundler to consume during server builds. */
  preserveClientAssetImports?: boolean;
  /** Prepared, compiler-safe plugin projection. Raw plugin configuration is never accepted here. */
  pluginRegistry?: ExactPreparedCompilerRegistry;
  /**
   * Generated output is syntax-checked in the transform hot path by default.
   * Release checks can request a second full semantic binding.
   */
  generatedValidation?: "syntax" | "semantic";
  /** Identifies whether this compilation is a deployable application or a publishable library. */
  packageType?: "application" | "library";
  /** Stable package identity used for capability requirements and grants. */
  packageName?: string;
  /** Optional immutable package coordinates used when resolving pinned dependency grants. */
  packageVersion?: string;
  packageIntegrity?: string;
  /** Application-owner capability policy. Libraries emit requirements without applying grants. */
  capabilityPolicy?: {
    unsafeHtml?: {
      enabled: boolean;
      grants?: readonly string[];
    };
    secrets?: {
      grants?: readonly ExactSecretGrant[];
    };
  };
};

export type ExactSecretGrant = {
  package: string;
  secrets: readonly string[];
  version?: string;
  integrity?: string;
};

export type ExactPackageProvenanceIR = {
  name: string;
  version?: string;
  integrity?: string;
  source: "application" | "library" | "installed" | "workspace" | "symlink";
};

/** Host-neutral final module pass applied after eXact lowering and before maps. */
export type ModuleTransform = (input: Readonly<{
  id: string;
  source: string;
  target: TransformTarget;
}>) => Readonly<{ code: string }>;

export type TransformTarget = "default" | "client" | "server";

export type ExactAssetKind = "style" | "image" | "video" | "audio" | "font" | "document" | "data" | "worker" | "other";
export type ExactAssetImportMode = "side-effect" | "url" | "raw" | "inline" | "module" | "worker";
export type ExactAssetTarget = "client" | "server" | "both" | "embedded";

export type ExactAssetRule = {
  extensions?: readonly string[];
  queries?: readonly string[];
  kind: ExactAssetKind;
  importMode?: ExactAssetImportMode;
  evaluationTarget?: Exclude<ExactAssetTarget, "embedded">;
  deliveryTarget?: ExactAssetTarget;
};

export type ExactAssetDependencyIR = {
  specifier: string;
  kind: ExactAssetKind;
  importMode: ExactAssetImportMode;
  evaluationTarget: Exclude<ExactAssetTarget, "embedded">;
  deliveryTarget: ExactAssetTarget;
};

export type ExactRawHtmlCapabilityIR = {
  source: string;
  line: number;
  column: number;
  symbol: string;
  targets: ExactArtifactTarget[];
};

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

export type ExactPolicyResidency = "server" | "client" | "isomorphic";

export type ExactDataPolicyIR = {
  residency: ExactPolicyResidency;
  secret: boolean;
};

export type ExactPolicySubjectIR = {
  id: string;
  kind: "declaration" | "field" | "parameter" | "return" | "state" | "context";
  name: string;
  path?: string;
  componentId?: string;
  callableId?: string;
  parameterIndex?: number;
  /** Provider selector when statically known. Never contains a secret value. */
  selector?: string;
  policy: ExactDataPolicyIR;
  source: "annotation" | "context-option" | "inference" | "import";
};

export type ExactPolicyFlowKind = "propagation" | "receipt" | "projection" | "transfer";

export type ExactPolicyFlowIR = {
  id: string;
  kind: ExactPolicyFlowKind;
  from: string[];
  to: string;
  policy: ExactDataPolicyIR;
  boundary?: "client-island" | "hydration" | "context" | "call" | "state";
  authorized: boolean;
  reason?: string;
};

export type ExactSecretConsumptionAuthorization =
  | "implicit-application-owner"
  | "explicit-grant"
  | "library-requirement"
  | "denied";

export type ExactSecretConsumptionIR = {
  id: string;
  selector?: string;
  dynamic: boolean;
  source: string;
  line: number;
  column: number;
  caller: string;
  consumer: {
    package: string;
    symbol: string;
    parameter: number;
    provenance?: ExactPackageProvenanceIR;
  };
  target: ExactArtifactTarget;
  authorization: ExactSecretConsumptionAuthorization;
  grant?: ExactSecretGrant;
  reason?: string;
};

export type ExactPolicyAuditReport = {
  version: 1;
  generatedAt: string;
  secretUsage: Array<{
    selector: string;
    consumer: string;
    symbol: string;
    parameter: number;
    status: "implicit" | "granted" | "denied" | "required";
    source: string;
  }>;
  warnings: string[];
  errors: string[];
};

export type ExactPolicyManifestIR = {
  version: 1;
  subjects: ExactPolicySubjectIR[];
  flows: ExactPolicyFlowIR[];
  secretConsumers: ExactSecretConsumptionIR[];
};

export type ExactEnvironmentEffect = "neutral" | "browser" | "server" | "mixed" | "unknown";

export type ExactEnvironmentEffectSourceIR = {
  environment: "browser" | "server" | "unknown";
  description: string;
  path: string[];
};

export type ExactCallEdgeIR = {
  id: string;
  name: string;
  targetId?: string;
  moduleSpecifier?: string;
  exportName?: string;
  resolved: boolean;
  receiverBindings?: Array<{
    parameterIndex: number;
    source: "component" | "parameter" | "unknown";
    sourceParameterIndex?: number;
  }>;
  /** Direct argument forwarding used by parametric cross-package policy analysis. */
  argumentBindings?: Array<{
    parameterIndex: number;
    sourceParameterIndex: number;
  }>;
};

export type ExactCallableSummaryIR = {
  id: string;
  name: string;
  kind: "function" | "method" | "component" | "task" | "initializer" | "module-initializer";
  exportNames: string[];
  directEffect: ExactEnvironmentEffect;
  effect: ExactEnvironmentEffect;
  directEffectSources: ExactEnvironmentEffectSourceIR[];
  effectSources: ExactEnvironmentEffectSourceIR[];
  calls: ExactCallEdgeIR[];
  artifactTargets: ExactArtifactTarget[];
  stateReads: ExactStateEffect[];
  stateWrites: ExactStateEffect[];
  contexts: ExactContextEffect[];
};

export type ExactStateEffect = {
  path: string;
  kind: "read" | "write";
  confidence: "exact" | "broad" | "unknown";
  receiver?: { kind: "component" } | { kind: "parameter"; index: number } | { kind: "unknown" };
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
  environmentEffect?: ExactEnvironmentEffect;
  effectSources?: ExactEnvironmentEffectSourceIR[];
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
  environmentEffect?: ExactEnvironmentEffect;
  artifactTargets?: ExactArtifactTarget[];
};

export type ExactExportIR = {
  name: string;
  kind: "component" | "value";
  placement: ExactPlacement;
};

export type ExactArtifactExportIR = ExactExportIR & {
  artifactClass: "shared" | "dual" | "client" | "server";
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
  shared?: string;
  manifest: string;
  targets: {
    client: "client";
    server: "server";
    shared?: "shared";
  };
  exports: ExactArtifactExportIR[];
  symbols: ExactSymbolIR[];
  boundaries: ExactBoundaryIR[];
};

export type ExactCompilerManifest = {
  version: 6;
  filename: string;
  dependencies: string[];
  assets: ExactAssetDependencyIR[];
  semanticGraph?: ExactSemanticGraphIR;
  components: ExactComponentIR[];
  exports: ExactExportIR[];
  symbols: ExactSymbolIR[];
  boundaries: ExactBoundaryIR[];
  callables: ExactCallableSummaryIR[];
  policy: ExactPolicyManifestIR;
  packageName?: string;
  packageProvenance?: ExactPackageProvenanceIR;
  requiredCapabilities?: {
    rawHtml: ExactRawHtmlCapabilityIR[];
  };
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
  pluginRegistry?: {
    fingerprint: string;
    plugins: Record<string, {
      version: string;
      protocolVersion: string;
      required: boolean;
      compilerConfigKey: ExactJsonValue;
    }>;
  };
  pluginData?: Record<string, ExactJsonValue>;
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
  moduleRewrite?: ModuleRewriteOptions;
  moduleTransform?: ModuleTransform;
  assetRules?: readonly ExactAssetRule[];
  session?: ExactCompilerSession;
  pluginRegistry?: ExactPreparedCompilerRegistry;
  generatedValidation?: "syntax" | "semantic";
  packageType?: TransformOptions["packageType"];
  packageName?: string;
  packageVersion?: string;
  packageIntegrity?: string;
  capabilityPolicy?: TransformOptions["capabilityPolicy"];
  /** Discovers manifests advertised by installed packages. Defaults to true. */
  discoverPackageManifests?: boolean;
};

export type CompileArtifactsResult = {
  inputFile: string;
  clientFile: string;
  serverFile: string;
  sharedFile?: string;
  clientMapFile?: string;
  serverMapFile?: string;
  manifestFile: string;
  client: TransformResult;
  server: TransformResult;
  shared?: TransformResult;
  manifest: ExactCompilerManifest;
};

export type ExactArtifactGraphInput = {
  inputFile: string;
  clientFile: string;
  serverFile: string;
  sharedFile?: string;
  manifestFile: string;
  manifest: ExactCompilerManifest;
};

export type CompileArtifactPlanEntriesOptions = {
  filename?(entry: ExactArtifactPlanEntry): string;
  importedManifests?: readonly ExactCompilerManifest[];
  serverComponents?: boolean;
  sourceMap?: boolean;
  moduleRewrite?: ModuleRewriteOptions;
  moduleTransform?: ModuleTransform;
  assetRules?: readonly ExactAssetRule[];
  session?: ExactCompilerSession;
  pluginRegistry?: ExactPreparedCompilerRegistry;
  generatedValidation?: "syntax" | "semantic";
  packageType?: TransformOptions["packageType"];
  packageName?: string;
  packageVersion?: string;
  packageIntegrity?: string;
  capabilityPolicy?: TransformOptions["capabilityPolicy"];
  /** Discovers manifests advertised by installed packages. Defaults to true. */
  discoverPackageManifests?: boolean;
};

export type ExactDiscoveredPackageManifest = {
  packageName: string;
  packageRoot: string;
  manifestFile: string;
  provenance: ExactPackageProvenanceIR;
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
  sharedFile: string;
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
  typesRoot?: string;
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
  sharedFile?: string;
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
import type { ModuleRewriteOptions } from "@exact/expressions";

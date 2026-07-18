import { readFileSync } from "node:fs";
import path from "node:path";
import { intersects, satisfies, validRange } from "semver";
import {
  packageDirectlyDependsOnAdapterMarker,
  dependencyRange,
  packageNameFromBareSpecifier,
  readReactCompatAdapterDeclaration,
  readReactCompatApplicationPolicy,
  reactCompatAdapterMarkerPackage,
  reactCompatAdapterProtocolVersion,
  type PackageManifestLike,
  type ReactCompatAdapterDeclaration,
  type ReactCompatReplacementDeclaration
} from "@exact/react-compat-adapter-api";

export interface ReactCompatPackageNode {
  readonly id: string;
  readonly location: string;
  readonly manifest: PackageManifestLike;
  readonly dependencies: readonly string[];
}

export interface ReactCompatPackageGraph {
  readonly rootId: string;
  readonly nodes: ReadonlyMap<string, ReactCompatPackageNode>;
}

export interface ResolvedReactCompatReplacement extends ReactCompatReplacementDeclaration {
  readonly sourceInstance: string;
  readonly sourceLocation: string;
  readonly sourceModule: string;
  readonly sourcePackage: string;
  readonly sourceExport: string;
  readonly sourceVersion: string;
  readonly adapterPackage: string;
  readonly adapterVersion: string;
  readonly specifier: string;
}

export interface ResolvedReactCompatAdapters {
  readonly replacements: ReadonlyMap<string, ResolvedReactCompatReplacement>;
  readonly unsupportedSources: readonly UnsupportedReactCompatSource[];
  readonly adapters: readonly string[];
  readonly ignoredAdapters: readonly string[];
}

export interface UnsupportedReactCompatSource {
  readonly sourceInstance: string;
  readonly sourceLocation: string;
  readonly sourceModule: string;
  readonly sourcePackage: string;
  readonly installedVersion: string;
  readonly supportedRanges: readonly string[];
  readonly adapterPackage: string;
  readonly adapterVersion: string;
}

/** Selects replacements using the package instance that the importer resolves. */
export function replacementsForImporter(
  graph: ReactCompatPackageGraph,
  registry: ResolvedReactCompatAdapters,
  importer: string
): readonly ResolvedReactCompatReplacement[] {
  const modules = new Set([...registry.replacements.values()].map(value => value.sourceModule));
  const selected: ResolvedReactCompatReplacement[] = [];
  for (const sourceModule of modules) {
    const instance = resolveSourceInstance(graph, importer, packageNameFromBareSpecifier(sourceModule));
    if (!instance) continue;
    for (const replacement of registry.replacements.values()) {
      if (replacement.sourceInstance === instance.id && replacement.sourceModule === sourceModule) selected.push(replacement);
    }
  }
  return Object.freeze(selected);
}

export function unsupportedSourcesForImporter(
  graph: ReactCompatPackageGraph,
  registry: ResolvedReactCompatAdapters,
  importer: string
): readonly UnsupportedReactCompatSource[] {
  return Object.freeze(registry.unsupportedSources.filter(source =>
    resolveSourceInstance(graph, importer, source.sourcePackage)?.id === source.sourceInstance
  ));
}

/** Discovers reachable adapters and resolves their declarations into a conflict-free registry. */
export function discoverReactCompatAdapters(graph: ReactCompatPackageGraph): ResolvedReactCompatAdapters {
  const root = graph.nodes.get(graph.rootId);
  if (!root) throw new Error(`React compatibility package graph root ${JSON.stringify(graph.rootId)} does not exist`);
  const ignored = new Set(readReactCompatApplicationPolicy(root.manifest, `${root.location}/package.json`).ignoreAdapters ?? []);
  const reachable = reachableNodes(graph);
  const replacements = new Map<string, ResolvedReactCompatReplacement>();
  const unsupportedSources: UnsupportedReactCompatSource[] = [];
  const adapters: string[] = [];
  const candidates = [...reachable]
    .filter(node => node.id !== graph.rootId)
    .map(node => ({ node, declaration: readReactCompatAdapterDeclaration(node.manifest, `${node.location}/package.json`) }))
    .filter((value): value is { node: ReactCompatPackageNode; declaration: ReactCompatAdapterDeclaration } => value.declaration !== undefined)
    .filter(value => !ignored.has(packageName(value.node)))
    .sort((left, right) => packageName(left.node).localeCompare(packageName(right.node)) || left.node.id.localeCompare(right.node.id));
  const candidatesByName = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const name = packageName(candidate.node);
    const values = candidatesByName.get(name) ?? [];
    values.push(candidate);
    candidatesByName.set(name, values);
  }
  for (const [name, values] of candidatesByName) {
    const versions = [...new Set(values.map(value => packageVersion(value.node)))];
    if (versions.length > 1) {
      throw new Error(`React compatibility build root ${root.location} reaches incompatible versions of adapter ${name}: ${versions.join(", ")}`);
    }
  }
  for (const { node, declaration } of [...candidatesByName.values()].map(values => values[0]!)) {
    const name = packageName(node);
    if (!packageDirectlyDependsOnAdapterMarker(node.manifest)) {
      throw new Error(`React compatibility adapter ${name} must directly depend on @exact/react-compat-adapter-api`);
    }
    validateProtocolRange(node);
    validateAdapterExports(node, declaration);
    adapters.push(name);
    for (const [sourceModule, source] of Object.entries(declaration.substitutions)) {
      const sourcePackage = packageNameFromBareSpecifier(sourceModule);
      for (const [index, variant] of source.variants.entries()) {
        if (!validRange(variant.version)) throw new Error(`React compatibility adapter ${name} declares invalid source range ${JSON.stringify(variant.version)} for ${sourcePackage}`);
        for (const previous of source.variants.slice(0, index)) {
          if (intersects(previous.version, variant.version, { includePrerelease: true })) {
            throw new Error(`React compatibility adapter ${name} declares overlapping source ranges ${JSON.stringify(previous.version)} and ${JSON.stringify(variant.version)} for ${sourceModule}`);
          }
        }
      }
      for (const sourceNode of reachable.filter(candidate => candidate.manifest.name === sourcePackage)) {
        const installedVersion = packageVersion(sourceNode);
        const variant = source.variants.find(candidate => satisfies(installedVersion, candidate.version, { includePrerelease: true }));
        if (!variant) {
          unsupportedSources.push(Object.freeze({
            sourceInstance: sourceNode.id,
            sourceLocation: sourceNode.location,
            sourceModule,
            sourcePackage,
            installedVersion,
            supportedRanges: Object.freeze(source.variants.map(candidate => candidate.version)),
            adapterPackage: name,
            adapterVersion: packageVersion(node)
          }));
          continue;
        }
        for (const [sourceExport, replacement] of Object.entries(variant.exports)) {
          const key = replacementKey(sourceNode.id, sourceModule, sourceExport);
          const resolved: ResolvedReactCompatReplacement = Object.freeze({
            ...replacement,
            sourceInstance: sourceNode.id,
            sourceLocation: sourceNode.location,
            sourceModule,
            sourcePackage,
            sourceExport,
            sourceVersion: variant.version,
            adapterPackage: name,
            adapterVersion: packageVersion(node),
            specifier: replacement.subpath === "." ? name : `${name}${replacement.subpath.slice(1)}`
          });
          const previous = replacements.get(key);
          if (previous) {
            throw new Error(
              `React compatibility replacement conflict at build root ${root.location} for ` +
              `${sourceModule} from ${sourceNode.location}@${installedVersion}.${sourceExport}: ` +
              `${previous.adapterPackage}@${previous.adapterVersion} -> ${previous.specifier}#${previous.export} and ` +
              `${name}@${packageVersion(node)} -> ${resolved.specifier}#${resolved.export}`
            );
          }
          replacements.set(key, resolved);
        }
      }
    }
  }
  return Object.freeze({
    replacements,
    unsupportedSources: Object.freeze(unsupportedSources),
    adapters: Object.freeze(adapters),
    ignoredAdapters: Object.freeze([...ignored].sort())
  });
}

/** Loads the nearest npm lockfile and materializes the installed graph without running npm. */
export function createNpmReactCompatPackageGraph(cwd = process.cwd()): ReactCompatPackageGraph {
  const applicationManifestFile = findUp(cwd, "package.json");
  const lockFile = findUp(path.dirname(applicationManifestFile), "package-lock.json");
  const lockRoot = path.dirname(lockFile);
  const lock = parseJson(readFileSync(lockFile, "utf8"), lockFile) as { lockfileVersion?: unknown; packages?: unknown };
  if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) throw new Error(`${lockFile} must use npm lockfileVersion 2 or 3`);
  if (!isRecord(lock.packages)) throw new Error(`${lockFile} does not contain an npm packages graph`);
  const records = lock.packages;
  const links = new Map<string, string>();
  for (const [id, raw] of Object.entries(records)) {
    if (!isRecord(raw) || raw.link !== true || typeof raw.resolved !== "string") continue;
    links.set(normalizeId(id), normalizeId(raw.resolved));
  }
  const rawNodes = new Map<string, { location: string; manifest: PackageManifestLike; dependencyNames: string[] }>();
  for (const [rawId, lockEntry] of Object.entries(records)) {
    if (!isRecord(lockEntry) || lockEntry.link === true) continue;
    const id = normalizeId(rawId);
    const location = path.resolve(lockRoot, rawId || ".");
    const manifestFile = path.join(location, "package.json");
    let manifest: PackageManifestLike = lockEntry;
    try { manifest = parseJson(readFileSync(manifestFile, "utf8"), manifestFile) as PackageManifestLike; } catch (error) {
      if (id === "" || !isMissingFileError(error)) throw error;
    }
    const dependencyNames = [...new Set([
      ...objectKeys(manifest.dependencies),
      ...objectKeys(manifest.optionalDependencies),
      ...objectKeys(manifest.peerDependencies)
    ])].sort();
    rawNodes.set(id, { location, manifest, dependencyNames });
  }
  const applicationId = normalizeId(path.relative(lockRoot, path.dirname(applicationManifestFile)));
  const rootId = applicationId === "." ? "" : applicationId;
  if (!rawNodes.has(rootId)) throw new Error(`${applicationManifestFile} is not represented in ${lockFile}`);
  const nodes = new Map<string, ReactCompatPackageNode>();
  for (const [id, node] of rawNodes) {
    const dependencies = node.dependencyNames.map(name => resolveDependencyId(id, name, rawNodes, links)).filter((value): value is string => value !== undefined);
    // Running at a workspace root models npm's workspace forest as reachable.
    if (id === "" && rootId === "") {
      for (const workspaceId of rawNodes.keys()) if (workspaceId && !workspaceId.startsWith("node_modules/")) dependencies.push(workspaceId);
    }
    nodes.set(id, Object.freeze({ id, location: node.location, manifest: node.manifest, dependencies: Object.freeze([...new Set(dependencies)].sort()) }));
  }
  return Object.freeze({ rootId, nodes });
}

/** Uses npm metadata when present and falls back to the installed package tree. */
export function createReactCompatPackageGraph(cwd = process.cwd()): ReactCompatPackageGraph {
  try {
    return createNpmReactCompatPackageGraph(cwd);
  } catch (error) {
    if (!isMissingDiscoveryFile(error)) throw error;
    return createInstalledReactCompatPackageGraph(cwd);
  }
}

/** Walks a Node-compatible installed tree without relying on a package-manager command. */
export function createInstalledReactCompatPackageGraph(cwd = process.cwd()): ReactCompatPackageGraph {
  const rootManifestFile = findUp(cwd, "package.json");
  const rootId = normalizeId(path.resolve(rootManifestFile));
  const pending = [rootManifestFile];
  const nodes = new Map<string, ReactCompatPackageNode>();
  while (pending.length) {
    const manifestFile = path.resolve(pending.shift()!);
    const id = normalizeId(manifestFile);
    if (nodes.has(id)) continue;
    const manifest = parseJson(readFileSync(manifestFile, "utf8"), manifestFile) as PackageManifestLike;
    const location = path.dirname(manifestFile);
    const dependencyNames = [...new Set([
      ...objectKeys(manifest.dependencies),
      ...objectKeys(manifest.optionalDependencies),
      ...objectKeys(manifest.peerDependencies)
    ])].sort();
    const dependencyFiles: string[] = [];
    for (const name of dependencyNames) {
      const resolved = resolveInstalledManifest(location, name);
      if (!resolved) continue;
      dependencyFiles.push(resolved);
      if (!nodes.has(normalizeId(resolved))) pending.push(resolved);
    }
    nodes.set(id, Object.freeze({
      id,
      location,
      manifest,
      dependencies: Object.freeze(dependencyFiles.map(normalizeId).sort())
    }));
  }
  return Object.freeze({ rootId, nodes });
}

export function replacementKey(sourceInstance: string, sourceModule: string, sourceExport: string): string {
  return `${sourceInstance}\0${sourceModule}\0${sourceExport}`;
}

/** Validates one adapter package and its installed peers without executing it. */
export function validateReactCompatAdapterPackage(cwd = process.cwd()): ResolvedReactCompatAdapters {
  const installed = createInstalledReactCompatPackageGraph(cwd);
  const adapter = installed.nodes.get(installed.rootId);
  if (!adapter) throw new Error(`Adapter package graph root ${installed.rootId} does not exist`);
  if (!readReactCompatAdapterDeclaration(adapter.manifest, `${adapter.location}/package.json`)) {
    throw new Error(`${adapter.location}/package.json does not declare exact.reactCompatibility adapter metadata`);
  }
  validateReplacementTypeDeclarations(adapter, readReactCompatAdapterDeclaration(adapter.manifest, `${adapter.location}/package.json`)!);
  const rootId = "__exact_adapter_validation_root__";
  const nodes = new Map(installed.nodes);
  nodes.set(rootId, Object.freeze({
    id: rootId,
    location: adapter.location,
    manifest: { name: "@exact/adapter-validation-root", version: "1.0.0" },
    dependencies: Object.freeze([installed.rootId])
  }));
  return discoverReactCompatAdapters(Object.freeze({ rootId, nodes }));
}

function validateReplacementTypeDeclarations(node: ReactCompatPackageNode, declaration: ReactCompatAdapterDeclaration): void {
  for (const source of Object.values(declaration.substitutions)) for (const variant of source.variants) for (const replacement of Object.values(variant.exports)) {
    const target = exportTarget(node.manifest.exports, replacement.subpath);
    if (!target) continue;
    const typesTarget = conditionalTarget(target, "types") ?? conditionalTarget(target, "default") ?? (typeof target === "string" ? target : undefined);
    if (!typesTarget) throw new Error(`React compatibility adapter ${packageName(node)} cannot resolve a type declaration for ${replacement.subpath}`);
    const declarationFile = path.resolve(node.location, typesTarget.replace(/\.(?:m|c)?js$/, ".d.ts"));
    let sourceText: string;
    try { sourceText = readFileSync(declarationFile, "utf8"); }
    catch { throw new Error(`React compatibility adapter ${packageName(node)} type declaration ${declarationFile} was not found; build the adapter before validation`); }
    if (!declaresExport(sourceText, replacement.export)) {
      throw new Error(`React compatibility adapter ${packageName(node)} type declaration ${declarationFile} does not export ${replacement.export}`);
    }
  }
}

function exportTarget(exportsField: unknown, subpath: string): unknown {
  if (typeof exportsField === "string" || Array.isArray(exportsField)) return subpath === "." ? exportsField : undefined;
  if (!isRecord(exportsField)) return undefined;
  if (Object.prototype.hasOwnProperty.call(exportsField, subpath)) return exportsField[subpath];
  return subpath === "." && Object.keys(exportsField).every(key => !key.startsWith(".")) ? exportsField : undefined;
}

function conditionalTarget(value: unknown, condition: string): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(item => conditionalTarget(item, condition)).find(Boolean);
  if (!isRecord(value)) return undefined;
  return conditionalTarget(value[condition], condition)
    ?? (condition !== "default" ? conditionalTarget(value.default, condition) : undefined)
    ?? Object.values(value).map(item => conditionalTarget(item, condition)).find(Boolean);
}

function declaresExport(source: string, exportName: string): boolean {
  if (exportName === "default") return /\bexport\s+default\b/.test(source);
  const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:const|let|var|function|class|enum)\\s+${escaped}\\b`).test(source)
    || [...source.matchAll(/\bexport\s*\{([^}]*)\}/g)].some(match => match[1]!.split(",").some(item => {
      const names = item.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      return (names[1] ?? names[0])?.trim() === exportName;
    }));
}

function reachableNodes(graph: ReactCompatPackageGraph): ReactCompatPackageNode[] {
  const result: ReactCompatPackageNode[] = [];
  const seen = new Set<string>();
  const pending = [graph.rootId];
  while (pending.length) {
    const id = pending.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = graph.nodes.get(id);
    if (!node) throw new Error(`React compatibility package graph references missing node ${JSON.stringify(id)}`);
    result.push(node);
    pending.push(...node.dependencies);
  }
  return result;
}

function validateAdapterExports(node: ReactCompatPackageNode, declaration: ReactCompatAdapterDeclaration): void {
  for (const source of Object.values(declaration.substitutions)) for (const variant of source.variants) for (const replacement of Object.values(variant.exports)) {
    if (!manifestExportsSubpath(node.manifest.exports, replacement.subpath)) {
      throw new Error(`React compatibility adapter ${packageName(node)} replacement subpath ${replacement.subpath} is not a public package export`);
    }
  }
}

function resolveSourceInstance(
  graph: ReactCompatPackageGraph,
  importer: string,
  sourcePackage: string
): ReactCompatPackageNode | undefined {
  const normalizedImporter = path.resolve(importer).toLowerCase();
  const owners = [...graph.nodes.values()]
    .filter(node => {
      const location = path.resolve(node.location).toLowerCase();
      return normalizedImporter === location || normalizedImporter.startsWith(`${location}${path.sep}`);
    })
    .sort((left, right) => right.location.length - left.location.length);
  if (!owners.length) {
    const root = graph.nodes.get(graph.rootId);
    if (root) owners.push(root);
  }
  for (const owner of owners) {
    if (owner.manifest.name === sourcePackage) return owner;
    for (const dependencyId of owner.dependencies) {
      const dependency = graph.nodes.get(dependencyId);
      if (dependency?.manifest.name === sourcePackage) return dependency;
    }
  }
  return undefined;
}

function validateProtocolRange(node: ReactCompatPackageNode): void {
  const range = dependencyRange(node.manifest.dependencies, reactCompatAdapterMarkerPackage)
    ?? dependencyRange(node.manifest.optionalDependencies, reactCompatAdapterMarkerPackage);
  if (!range) return;
  // Workspace/file dependencies are resolved to a concrete package version by
  // the package graph. Published semver ranges must opt into protocol major 1.
  if (range.startsWith("file:") || range.startsWith("workspace:")) return;
  if (!validRange(range) || !satisfies(reactCompatAdapterProtocolVersion, range)) {
    throw new Error(`React compatibility adapter ${packageName(node)} declares incompatible ${reactCompatAdapterMarkerPackage} range ${JSON.stringify(range)}; expected a range accepting ${reactCompatAdapterProtocolVersion}`);
  }
}

function manifestExportsSubpath(exportsField: unknown, subpath: string): boolean {
  const target = exportTarget(exportsField, subpath);
  return target !== undefined
    && resolvesExportTarget(target, new Set(["exact-client", "browser", "import", "default"]))
    && resolvesExportTarget(target, new Set(["exact-server", "node", "import", "default"]));
}

function resolvesExportTarget(value: unknown, conditions: ReadonlySet<string>): boolean {
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.some(item => resolvesExportTarget(item, conditions));
  if (!isRecord(value)) return false;
  for (const [condition, target] of Object.entries(value)) {
    if (condition === "types") continue;
    if (conditions.has(condition)) return resolvesExportTarget(target, conditions);
  }
  return false;
}

function resolveDependencyId(
  fromId: string,
  name: string,
  nodes: ReadonlyMap<string, unknown>,
  links: ReadonlyMap<string, string>
): string | undefined {
  const candidates: string[] = [];
  let base = fromId;
  while (true) {
    candidates.push(normalizeId(path.posix.join(base, "node_modules", name)));
    const marker = base.lastIndexOf("/node_modules/");
    if (marker < 0) break;
    base = base.slice(0, marker);
  }
  candidates.push(normalizeId(path.posix.join("node_modules", name)));
  for (const candidate of candidates) {
    const target = links.get(candidate) ?? candidate;
    if (nodes.has(target)) return target;
  }
  return undefined;
}

function packageName(node: ReactCompatPackageNode): string {
  if (typeof node.manifest.name !== "string" || !node.manifest.name) throw new Error(`${node.location}/package.json must declare a package name`);
  return node.manifest.name;
}

function packageVersion(node: ReactCompatPackageNode): string {
  if (typeof node.manifest.version !== "string" || !node.manifest.version) throw new Error(`${node.location}/package.json must declare a package version`);
  return node.manifest.version;
}

function findUp(cwd: string, filename: string): string {
  let directory = path.resolve(cwd);
  while (true) {
    const candidate = path.join(directory, filename);
    try { readFileSync(candidate, "utf8"); return candidate; } catch {}
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`${filename} was not found above ${cwd}`);
    directory = parent;
  }
}

function resolveInstalledManifest(fromLocation: string, packageName: string): string | undefined {
  let directory = path.resolve(fromLocation);
  while (true) {
    const candidate = path.join(directory, "node_modules", ...packageName.split("/"), "package.json");
    try { readFileSync(candidate, "utf8"); return candidate; } catch {}
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function parseJson(source: string, filename: string): unknown {
  try { return JSON.parse(source); } catch (error) { throw new Error(`Unable to parse ${filename}`, { cause: error }); }
}

function normalizeId(value: string): string { return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, ""); }
function objectKeys(value: unknown): string[] { return isRecord(value) ? Object.keys(value) : []; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isMissingFileError(error: unknown): boolean { return isRecord(error) && error.code === "ENOENT"; }
function isMissingDiscoveryFile(error: unknown): boolean {
  return error instanceof Error && (
    /package-lock\.json was not found/.test(error.message)
    || /package\.json was not found/.test(error.message)
    || /is not represented in .*package-lock\.json/.test(error.message)
  );
}

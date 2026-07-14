import ts from "typescript";
import path from "node:path";
import fs from "node:fs";
import type {
  ExpressionDiagnostic,
  ExpressionCallSignature,
  ExpressionNode,
  ExpressionScope,
  ExpressionSymbol,
  ExpressionType,
  ExpressionTypeKind,
  NodeCategory,
  ScopeKind,
  SourceSpan,
  Variable
} from "./model.js";
import { createModule, type BoundModule, type UnboundModule } from "./module.js";

export interface ExpressionProjectOptions {
  readonly tsconfigPath?: string;
  readonly cwd?: string;
}

export class ExpressionProjectError extends Error {
  constructor(readonly diagnostics: readonly ExpressionDiagnostic[]) {
    super(diagnostics.map(formatExpressionDiagnostic).join("\n"));
    this.name = "ExpressionProjectError";
  }
}

function formatExpressionDiagnostic(diagnostic: ExpressionDiagnostic): string {
  const location = diagnostic.filename
    ? `${diagnostic.filename}${diagnostic.span ? `:${diagnostic.span.line}:${diagnostic.span.column}` : ""}`
    : diagnostic.span
      ? `${diagnostic.span.line}:${diagnostic.span.column}`
      : undefined;
  return `${location ? `${location} - ` : ""}${diagnostic.code}: ${diagnostic.message}`;
}

class ProjectScope implements ExpressionScope {
  private owned: readonly Variable[] = [];
  constructor(readonly id: string, readonly kind: ScopeKind, readonly parent?: ExpressionScope) {}
  get variables(): readonly Variable[] { return this.owned; }
  add(variable: Variable): void { if (!this.owned.includes(variable)) this.owned = [...this.owned, variable]; }
  seal(): void { this.owned = Object.freeze([...this.owned]); }
}

class ProjectVariable implements Variable {
  readonly id: string;
  constructor(readonly symbol: ExpressionSymbol, name: string, kind: string, scope: ExpressionScope, readonly mutable: boolean, readonly synthetic = false) {
    this.id = symbol.id;
    this.name = name;
    this.declarationKind = kind;
    this.scope = scope;
  }
  readonly name: string;
  readonly declarationKind: string;
  readonly scope: ExpressionScope;
  type?: ExpressionType;
  exported = false;
  importedFrom?: string;
  typeOnly = false;
}

class ProjectType implements ExpressionType {
  constructor(
    readonly id: string,
    readonly kind: ExpressionTypeKind,
    readonly display: string,
    readonly nullable: boolean,
    readonly callable: boolean,
    readonly properties: readonly string[],
    readonly propertyTypes: ExpressionType["propertyTypes"],
    readonly unionMembers: readonly ExpressionType[],
    readonly callSignatures: readonly ExpressionCallSignature[],
    readonly typeArguments: readonly ExpressionType[],
    readonly typeParameters: readonly string[],
    readonly collectionKind?: "array" | "readonly-array" | "tuple"
  ) { Object.freeze(this); }
}

/** Project-aware TypeScript bridge. No TypeScript compiler objects escape this class. */
export class ExpressionProject {
  readonly tsconfigPath: string;
  private readonly parsed: ts.ParsedCommandLine;
  private readonly overlays = new Map<string, string>();
  private readonly overlayVersions = new Map<string, number>();
  private readonly sourceFiles = new Map<string, Readonly<{ version: string; sourceFile: ts.SourceFile }>>();
  private readonly symbolIdentities = new Map<string, ExpressionSymbol>();
  private readonly identityKeysByFile = new Map<string, Set<string>>();
  private typeHandles = new WeakMap<ExpressionType, ts.Type>();
  private program?: ts.Program;
  private disposed = false;

  constructor(options: ExpressionProjectOptions = {}) {
    const cwd = path.resolve(options.cwd ?? process.cwd());
    const config = options.tsconfigPath
      ? path.resolve(cwd, options.tsconfigPath)
      : ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
    if (!config) throw new ExpressionProjectError([{ code: "EXPR_CONFIG_MISSING", message: `No tsconfig.json found from ${cwd}`, severity: "error", phase: "configuration" }]);
    this.tsconfigPath = config;
    const read = ts.readConfigFile(config, ts.sys.readFile);
    if (read.error) throw new ExpressionProjectError([{ ...diagnosticFromTs(read.error), phase: "configuration" }]);
    this.parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config), undefined, config);
    if (this.parsed.errors.length) throw new ExpressionProjectError(this.parsed.errors.map(error => ({ ...diagnosticFromTs(error), phase: "configuration" as const })));
  }

  updateModule(filename: string, source: string): BoundModule {
    this.assertActive();
    const normalized = normalizeFile(filename);
    this.setOverlay(normalized, source);
    this.rebuild();
    return this.readBoundModule(normalized);
  }

  updateModules(entries: Iterable<readonly [filename: string, source: string]>): ReadonlyMap<string, BoundModule> {
    const filenames: Array<Readonly<{ display: string; canonical: string }>> = [];
    for (const [filename, source] of entries) {
      const normalized = normalizeFile(filename);
      filenames.push({ display: displayFile(filename), canonical: normalized });
      this.setOverlay(normalized, source);
    }
    this.rebuild();
    return new Map(filenames.map(filename => [filename.display, this.readBoundModule(filename.canonical)]));
  }

  getModule(filename: string, source?: string): BoundModule {
    this.assertActive();
    const normalized = normalizeFile(filename);
    if (source !== undefined) return this.updateModule(normalized, source);
    if (!this.program) this.rebuild();
    return this.readBoundModule(normalized);
  }

  async bind(module: UnboundModule): Promise<BoundModule> {
    const structuralErrors = module.validate().filter(diagnostic => diagnostic.severity === "error");
    if (structuralErrors.length) throw new ExpressionProjectError(structuralErrors);
    const emitted = module.emit({ format: "generated" }).code;
    const bound = this.updateModule(module.filename, emitted);
    if (!module.provenance) return bound;
    return createModule({
      filename: bound.filename,
      source: bound.source,
      root: bound.rootNode,
      state: "bound",
      diagnostics: bound.diagnostics,
      trivia: bound.trivia,
      provenance: module.provenance
    });
  }

  emit(module: BoundModule, options: Parameters<BoundModule["emit"]>[0] = {}) {
    const errors = module.diagnostics.filter(diagnostic => diagnostic.severity === "error");
    if (errors.length) throw new ExpressionProjectError(errors);
    return module.emit(options);
  }

  isAssignable(source: ExpressionType, target: ExpressionType): boolean {
    const sourceHandle = this.typeHandles.get(source);
    const targetHandle = this.typeHandles.get(target);
    if (sourceHandle && targetHandle && this.program) {
      return this.program.getTypeChecker().isTypeAssignableTo(sourceHandle, targetHandle);
    }
    if (source.id === target.id || target.kind === "any" || target.kind === "unknown" || source.kind === "never") return true;
    if (target.kind === "union") return target.unionMembers.some(member => this.isAssignable(source, member));
    if (source.kind === "union") return source.unionMembers.every(member => this.isAssignable(member, target));
    return source.display === target.display;
  }

  /** Resolves a runtime import using this project's exact TypeScript configuration. */
  resolveModuleSpecifier(specifier: string, containingFile: string): string | undefined {
    this.assertActive();
    const resolved = ts.resolveModuleName(specifier, containingFile, this.parsed.options, {
      ...ts.sys,
      fileExists: file => this.overlays.has(normalizeFile(file)) || ts.sys.fileExists(file),
      readFile: file => this.overlays.get(normalizeFile(file)) ?? ts.sys.readFile(file)
    }).resolvedModule;
    return resolved ? displayFile(resolved.resolvedFileName) : undefined;
  }

  /** Removes an in-memory source and invalidates any cached disk syntax for it. */
  removeModule(filename: string): void {
    this.assertActive();
    const normalized = normalizeFile(filename);
    this.overlays.delete(normalized);
    this.overlayVersions.delete(normalized);
    this.sourceFiles.delete(normalized);
    this.rebuild();
  }

  /** Invalidates a disk-backed source before the next incremental rebuild. */
  invalidateFile(filename: string): void {
    this.assertActive();
    this.sourceFiles.delete(normalizeFile(filename));
    this.rebuild();
  }

  dispose(): void {
    this.disposed = true;
    this.overlays.clear();
    this.overlayVersions.clear();
    this.sourceFiles.clear();
    this.symbolIdentities.clear();
    this.identityKeysByFile.clear();
    this.program = undefined;
  }

  private assertActive(): void {
    if (this.disposed) throw new ExpressionProjectError([{ code: "EXPR_PROJECT_DISPOSED", message: "This expression project has been disposed", severity: "error", phase: "configuration" }]);
  }

  private rebuild(): void {
    // TypeScript types belong to exactly one Program/TypeChecker generation.
    // Never retain them as handles for a rebuilt project.
    this.typeHandles = new WeakMap();
    const compilerOptions: ts.CompilerOptions = {
      ...this.parsed.options,
      // JavaScript modules are part of the supported runtime grammar even when
      // a project's normal typecheck excludes them.
      allowJs: true,
      checkJs: this.parsed.options.checkJs ?? false
    };
    const roots = new Set(this.parsed.fileNames.map(normalizeFile));
    for (const file of this.overlays.keys()) roots.add(file);
    const base = ts.createCompilerHost(compilerOptions, true);
    const overlays = this.overlays;
    const overlayVersions = this.overlayVersions;
    const thisProject = this;
    const host: ts.CompilerHost = {
      ...base,
      fileExists(file) { return overlays.has(normalizeFile(file)) || base.fileExists(file); },
      readFile(file) { return overlays.get(normalizeFile(file)) ?? base.readFile(file); },
      getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile) {
        const normalized = normalizeFile(file);
        const source = overlays.get(normalized);
        if (source !== undefined) {
          const version = `overlay:${overlayVersions.get(normalized) ?? 0}`;
          const cached = thisProject.sourceFiles.get(normalized);
          if (cached?.version === version) return cached.sourceFile;
          const created = ts.createSourceFile(file, source, languageVersion, true, scriptKind(file)) as ts.SourceFile & { version?: string };
          created.version = version;
          thisProject.sourceFiles.set(normalized, { version, sourceFile: created });
          return created;
        }
        const diskVersion = diskFileVersion(normalized);
        const cached = thisProject.sourceFiles.get(normalized);
        if (cached?.version === diskVersion) return cached.sourceFile;
        const created = base.getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
        if (created) thisProject.sourceFiles.set(normalized, { version: diskVersion, sourceFile: created });
        return created;
      }
    };
    this.program = ts.createProgram({ rootNames: [...roots], options: compilerOptions, host, oldProgram: this.program });
  }

  private setOverlay(filename: string, source: string): void {
    if (this.overlays.get(filename) !== source) this.overlayVersions.set(filename, (this.overlayVersions.get(filename) ?? 0) + 1);
    this.overlays.set(filename, source);
  }

  private readBoundModule(filename: string): BoundModule {
    const program = this.program!;
    const sourceFile = program.getSourceFile(filename) ?? program.getSourceFiles().find(file => normalizeFile(file.fileName) === filename);
    if (!sourceFile) throw new ExpressionProjectError([{ code: "EXPR_FILE_MISSING", message: `Module is not part of the expression project: ${filename}`, severity: "error", filename }]);
    const checker = program.getTypeChecker();
    const scopes = new Map<ts.Node, ProjectScope>();
    const symbolVariables = new Map<ts.Symbol, ProjectVariable>();
    const implicitThisVariables = new Map<ts.Node, ProjectVariable>();
    const typeCache = new Map<ts.Type, ExpressionType>();
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile).map(diagnostic => ({ ...diagnosticFromTs(diagnostic), phase: "syntax" as const })),
      ...program.getSemanticDiagnostics(sourceFile).map(diagnostic => ({ ...diagnosticFromTs(diagnostic), phase: "semantic" as const }))
    ];
    const usedIdentityKeys = new Set<string>();
    const symbolIdentity = (id: string, name: string): ExpressionSymbol => {
      usedIdentityKeys.add(id);
      const existing = this.symbolIdentities.get(id);
      if (existing) return existing;
      const identity = Object.freeze({ id, name });
      this.symbolIdentities.set(id, identity);
      return identity;
    };

    const scopeFor = (node: ts.Node): ProjectScope => {
      let owner: ts.Node | undefined = node;
      while (owner && !isScopeNode(owner)) owner = owner.parent;
      owner ??= sourceFile;
      const existing = scopes.get(owner);
      if (existing) return existing;
      const parent = owner.parent ? scopeFor(owner.parent) : undefined;
      const scope = new ProjectScope(`${filename}:scope:${owner.pos}:${owner.end}:${ts.SyntaxKind[owner.kind]}`, scopeKind(owner), parent === undefined || parent === existing ? undefined : parent);
      scopes.set(owner, scope);
      return scope;
    };

    const typeFor = (type: ts.Type, at: ts.Node): ExpressionType => {
      const cached = typeCache.get(type);
      if (cached) return cached;
      const display = checker.typeToString(type, at, ts.TypeFormatFlags.NoTruncation);
      const key = `${filename}:${(type as ts.Type & { id?: number }).id ?? "anonymous"}:${type.flags}:${display}`;
      // Install a cycle breaker before expanding recursive union members.
      const placeholder: ExpressionType = {
        id: `type:${key}`, kind: typeKind(type), display,
        nullable: false, callable: type.getCallSignatures().length > 0,
        properties: Object.freeze([]), propertyTypes: Object.freeze([]), unionMembers: Object.freeze([]),
        callSignatures: Object.freeze([]), typeArguments: Object.freeze([]), typeParameters: Object.freeze([])
      };
      typeCache.set(type, placeholder);
      const members = type.isUnionOrIntersection() ? type.types.map(member => typeFor(member, at)) : [];
      const signatures = type.getCallSignatures().map(signature => {
        const declaration = signature.getDeclaration() ?? at;
        return Object.freeze({
          display: checker.signatureToString(signature, at, ts.TypeFormatFlags.NoTruncation),
          parameters: Object.freeze(signature.getParameters().map(parameter => {
            const parameterDeclaration = parameter.valueDeclaration ?? parameter.declarations?.[0] ?? declaration;
            return Object.freeze({
              name: parameter.name,
              type: typeFor(checker.getTypeOfSymbolAtLocation(parameter, parameterDeclaration), parameterDeclaration),
              optional: Boolean(parameter.flags & ts.SymbolFlags.Optional)
                || ts.isParameter(parameterDeclaration) && (!!parameterDeclaration.questionToken || !!parameterDeclaration.initializer),
              rest: ts.isParameter(parameterDeclaration) && !!parameterDeclaration.dotDotDotToken
            });
          })),
          returnType: typeFor(checker.getReturnTypeOfSignature(signature), declaration),
          typeParameters: Object.freeze((signature.typeParameters ?? []).map(parameter => checker.typeToString(parameter, declaration)))
        });
      });
      const typeArguments = type.flags & ts.TypeFlags.Object && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference)
        ? checker.getTypeArguments(type as ts.TypeReference).map(argument => typeFor(argument, at))
        : [];
      const typeParameters = ((type as ts.Type & { typeParameters?: readonly ts.Type[] }).typeParameters ?? []).map(parameter => checker.typeToString(parameter, at));
      // Optional parameters are commonly represented as `Options | undefined`.
      // Surface the non-nullish object's properties on that union so callers do
      // not need to understand TypeScript's internal union representation.
      const propertyOwner = type.getNonNullableType();
      const properties = propertyOwner.getProperties();
      const propertyTypes = properties.map(property => {
        const declaration = property.valueDeclaration ?? property.declarations?.[0] ?? at;
        return Object.freeze({
          name: property.name,
          type: shallowTypeFor(checker.getTypeOfSymbolAtLocation(property, declaration), declaration),
          optional: Boolean(property.flags & ts.SymbolFlags.Optional),
          readonly: property.declarations?.some(candidate => ts.canHaveModifiers(candidate)
            && ts.getModifiers(candidate)?.some(modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword)) ?? false
        });
      });
      const value = new ProjectType(
        `type:${key}`,
        typeKind(type),
        display,
        Boolean(type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) || members.some(member => member.nullable),
        type.getCallSignatures().length > 0,
        Object.freeze(properties.map(property => property.name)),
        Object.freeze(propertyTypes),
        Object.freeze(members),
        Object.freeze(signatures),
        Object.freeze(typeArguments),
        Object.freeze(typeParameters),
        checker.isTupleType(type) ? "tuple" : checker.isArrayType(type) ? "array" : isReadonlyArrayType(checker, type) ? "readonly-array" : undefined
      );
      // Recursive members already reference the placeholder. Populate that
      // same identity rather than replacing it with a second object whose
      // recursive edges would remain permanently empty.
      Object.assign(placeholder, value);
      Object.freeze(placeholder);
      this.typeHandles.set(placeholder, type);
      return placeholder;
    };

    const shallowTypeFor = (type: ts.Type, at: ts.Node): ExpressionType => {
      const display = checker.typeToString(type, at, ts.TypeFormatFlags.NoTruncation);
      const members = type.isUnionOrIntersection()
        ? type.types.map(member => Object.freeze({
          id: `type-summary:${member.flags}:${checker.typeToString(member, at, ts.TypeFormatFlags.NoTruncation)}`,
          kind: typeKind(member),
          display: checker.typeToString(member, at, ts.TypeFormatFlags.NoTruncation),
          nullable: Boolean(member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)),
          callable: member.getCallSignatures().length > 0,
          properties: Object.freeze(member.getProperties().map(property => property.name)),
          propertyTypes: Object.freeze([]),
          unionMembers: Object.freeze([]),
          callSignatures: Object.freeze([]),
          typeArguments: Object.freeze([]),
          typeParameters: Object.freeze([])
        } satisfies ExpressionType))
        : [];
      return Object.freeze({
        id: `type-summary:${type.flags}:${display}`,
        kind: typeKind(type),
        display,
        nullable: Boolean(type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) || members.some(member => member.nullable),
        callable: type.getCallSignatures().length > 0,
        properties: Object.freeze(type.getProperties().map(property => property.name)),
        propertyTypes: Object.freeze([]),
        unionMembers: Object.freeze(members),
        callSignatures: Object.freeze([]),
        typeArguments: Object.freeze([]),
        typeParameters: Object.freeze([])
      });
    };

    const variableFor = (identifier: ts.Identifier): Variable | undefined => {
      if (identifier.text === "this" && ts.isParameter(identifier.parent)) return variableForThis(identifier);
      const symbol = ts.isShorthandPropertyAssignment(identifier.parent) && identifier.parent.name === identifier
        ? checker.getShorthandAssignmentValueSymbol(identifier.parent) ?? checker.getSymbolAtLocation(identifier)
        : checker.getSymbolAtLocation(identifier);
      if (!symbol) return undefined;
      const cached = symbolVariables.get(symbol);
      if (cached) return cached;
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? identifier;
      const declarationFile = normalizeFile(declaration.getSourceFile().fileName);
      const localName = declarationBindingName(declaration) ?? symbol.name;
      const key = declarationIdentity(declarationFile, declaration, localName);
      usedIdentityKeys.add(key);
      const scope = scopeFor(declaration);
      let variableType: ExpressionType | undefined;
      try { variableType = typeFor(checker.getTypeOfSymbolAtLocation(symbol, identifier), identifier); } catch { /* TypeScript can reject incomplete error symbols. */ }
      const variable = new ProjectVariable(symbolIdentity(key, localName), localName, ts.SyntaxKind[declaration.kind], scope, isMutableBinding(declaration));
      symbolVariables.set(symbol, variable);
      variable.type = variableType;
      variable.exported = Boolean(symbol.flags & ts.SymbolFlags.ExportValue);
      variable.importedFrom = importSource(declaration);
      variable.typeOnly = isTypeOnlyBinding(declaration);
      scope.add(variable);
      Object.freeze(variable);
      return variable;
    };

    const variableForThis = (node: ts.Node): Variable => {
      let owner: ts.Node = sourceFile;
      let declaration: ts.Node | undefined;
      for (let current = node.parent; current; current = current.parent) {
        if (ts.isArrowFunction(current)) continue;
        if (ts.isFunctionLike(current) || ts.isClassLike(current) || ts.isSourceFile(current)) {
          owner = current;
          if (ts.isFunctionLike(current)) {
            declaration = current.parameters.find(candidate => candidate.name.getText(sourceFile) === "this");
          }
          break;
        }
      }
      const existing = implicitThisVariables.get(owner);
      if (existing) return existing;
      const scope = scopeFor(declaration ?? owner);
      const key = declarationIdentity(filename, declaration ?? owner, "this");
      const variable = new ProjectVariable(
        symbolIdentity(key, "this"),
        "this",
        declaration ? "Parameter" : "ThisKeyword",
        scope,
        !!declaration,
        !declaration
      );
      try { variable.type = typeFor(checker.getTypeAtLocation(node), node); } catch { /* Invalid implicit this types remain unresolved. */ }
      variable.typeOnly = false;
      scope.add(variable);
      Object.freeze(variable);
      implicitThisVariables.set(owner, variable);
      return variable;
    };

    let nodeSequence = 0;
    const convert = (node: ts.Node): ExpressionNode => {
      const children: ExpressionNode[] = [];
      ts.forEachChild(node, child => {
        children.push(convert(child));
      });
      const start = ts.isSourceFile(node) ? 0 : node.getStart(sourceFile, false);
      const line = sourceFile.getLineAndCharacterOfPosition(start);
      const span: SourceSpan = Object.freeze({ start, end: node.end, line: line.line + 1, column: line.character + 1 });
      let semanticType: ExpressionType | undefined;
      if (ts.isExpression(node)) {
        try { semanticType = typeFor(checker.getTypeAtLocation(node), node); } catch { /* Invalid code is represented alongside diagnostics. */ }
      }
      const variable = ts.isIdentifier(node) ? variableFor(node) : node.kind === ts.SyntaxKind.ThisKeyword ? variableForThis(node) : undefined;
      const common: ExpressionNode = {
        id: `${filename}:node:${start}:${node.end}:${syntaxKindName(node)}:${nodeSequence++}`,
        kind: syntaxKindName(node),
        category: category(node),
        span,
        children: Object.freeze(children),
        synthetic: false,
        scope: scopeFor(node),
        type: semanticType,
        variable,
        text: sourceFile.text.slice(start, node.end),
        name: nodeName(node),
        operator: nodeOperator(node)
      };
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const target = children[0]!;
        let resolvedSignature: ExpressionCallSignature | undefined;
        if (ts.isCallExpression(node)) {
          const signature = checker.getResolvedSignature(node);
          if (signature) resolvedSignature = signatureFor(signature, node, checker, typeFor);
        }
        return Object.freeze({ ...common, target, arguments: Object.freeze(children.slice(1)), ...(resolvedSignature ? { resolvedSignature } : {}) });
      }
      if (ts.isFunctionLike(node)) {
        const parameters = node.parameters.flatMap(parameter => parameter.name.getText(sourceFile) === "this"
          ? [variableForThis(parameter.name)]
          : collectBindingIdentifiers(parameter.name).map(variableFor).filter((value): value is Variable => !!value));
        return Object.freeze({
          ...common,
          parameters: Object.freeze(parameters),
          captures: Object.freeze(functionCaptures(children, common.scope))
        });
      }
      if (ts.isJsxElement(node)) {
        const opening = children[0]!;
        const attributes = opening.children.find(child => child.kind === "JsxAttributes")?.children ?? [];
        return Object.freeze({
          ...common,
          tagName: node.openingElement.tagName.getText(sourceFile),
          attributes: Object.freeze(attributes),
          jsxChildren: Object.freeze(children.slice(1, -1))
        });
      }
      if (ts.isJsxSelfClosingElement(node)) {
        const attributes = children.find(child => child.kind === "JsxAttributes")?.children ?? [];
        return Object.freeze({
          ...common,
          tagName: node.tagName.getText(sourceFile),
          attributes: Object.freeze(attributes),
          jsxChildren: Object.freeze([])
        });
      }
      if (ts.isJsxFragment(node)) {
        return Object.freeze({ ...common, attributes: Object.freeze([]), jsxChildren: Object.freeze(children.slice(1, -1)) });
      }
      if (ts.isJsxAttribute(node) || ts.isJsxSpreadAttribute(node)) {
        return Object.freeze({
          ...common,
          name: ts.isJsxAttribute(node) ? node.name.getText(sourceFile) : undefined,
          initializer: children.at(-1)
        });
      }
      return Object.freeze(common);
    };

    const root = convert(sourceFile);
    for (const scope of scopes.values()) scope.seal();
    const module = createModule({ filename, source: sourceFile.text, root, state: "bound", diagnostics });
    const ownUsedIdentityKeys = new Set([...usedIdentityKeys].filter(key => key.startsWith(`${filename}:`)));
    const priorKeys = this.identityKeysByFile.get(filename);
    for (const key of priorKeys ?? []) if (!ownUsedIdentityKeys.has(key)) {
      this.symbolIdentities.delete(key);
    }
    this.identityKeysByFile.set(filename, ownUsedIdentityKeys);
    return module;
  }
}

function functionCaptures(children: readonly ExpressionNode[], functionScope: ExpressionScope): Variable[] {
  const captures = new Set<Variable>();
  const visit = (node: ExpressionNode, parent?: ExpressionNode): void => {
    if (node.variable && (node.kind === "Identifier" || node.kind === "ThisKeyword")
      && !scopeDescendsFrom(node.variable.scope, functionScope)
      && !isBindingPosition(node, parent)) captures.add(node.variable);
    for (const child of node.children) visit(child, node);
  };
  for (const child of children) visit(child);
  return [...captures];
}

function scopeDescendsFrom(scope: ExpressionScope, ancestor: ExpressionScope): boolean {
  for (let cursor: ExpressionScope | undefined = scope; cursor; cursor = cursor.parent) {
    if (cursor.id === ancestor.id) return true;
  }
  return false;
}

function isBindingPosition(node: ExpressionNode, parent?: ExpressionNode): boolean {
  if (!parent || parent.children[0] !== node) return false;
  return parent.category === "declaration" || parent.category === "pattern"
    || parent.kind === "Parameter" || parent.kind.startsWith("Import");
}

function syntaxKindName(node: ts.Node): string {
  if (ts.isNumericLiteral(node)) return "NumericLiteral";
  if (ts.isBigIntLiteral(node)) return "BigIntLiteral";
  if (ts.isStringLiteral(node)) return "StringLiteral";
  if (ts.isNoSubstitutionTemplateLiteral(node)) return "NoSubstitutionTemplateLiteral";
  if (ts.isRegularExpressionLiteral(node)) return "RegularExpressionLiteral";
  if (ts.isJsxText(node)) return "JsxText";
  return ts.SyntaxKind[node.kind];
}

function declarationIdentity(filename: string, declaration: ts.Node, name: string): string {
  const scopes: string[] = [];
  let cursor = declaration.parent;
  while (cursor && !ts.isSourceFile(cursor)) {
    if (ts.isFunctionLike(cursor) || ts.isClassLike(cursor) || ts.isModuleDeclaration(cursor) || ts.isBlock(cursor) || ts.isCaseBlock(cursor) || ts.isCatchClause(cursor)) {
      const named = hasNodeName(cursor) && cursor.name ? cursor.name.getText() : undefined;
      const functionBody = ts.isBlock(cursor) && ts.isFunctionLike(cursor.parent)
        && "body" in cursor.parent && cursor.parent.body === cursor;
      scopes.push(named
        ? `${ts.SyntaxKind[cursor.kind]}:${named}`
        : functionBody
          ? "Block:function-body"
          : `${ts.SyntaxKind[cursor.kind]}:${scopeShape(cursor)}#${structuralOrdinal(cursor)}`);
    }
    cursor = cursor.parent;
  }
  return `${filename}:${scopes.reverse().join("/")}:${ts.SyntaxKind[declaration.kind]}#${declarationOrdinal(declaration, name)}:${name}`;
}

function structuralOrdinal(node: ts.Node): number {
  if (!node.parent) return 0;
  let ordinal = 0;
  for (const child of node.parent.getChildren()) {
    if (child === node) return ordinal;
    if (child.kind === node.kind && scopeShape(child) === scopeShape(node)) ordinal++;
  }
  return ordinal;
}

function scopeShape(node: ts.Node): string {
  const bindings: string[] = [];
  node.forEachChild(child => {
    if (ts.isVariableStatement(child)) {
      for (const declaration of child.declarationList.declarations) {
        bindings.push(`${ts.SyntaxKind[declaration.kind]}:${declaration.name.getText()}`);
      }
    } else if ((ts.isFunctionDeclaration(child) || ts.isClassDeclaration(child)) && child.name) {
      bindings.push(`${ts.SyntaxKind[child.kind]}:${child.name.text}`);
    }
  });
  return `${ts.SyntaxKind[node.parent?.kind ?? ts.SyntaxKind.Unknown]}:${fingerprint(bindings.join("|"))}`;
}

function declarationOrdinal(declaration: ts.Node, name: string): number {
  const owner = nearestIdentityScope(declaration.parent);
  if (!owner) return 0;
  let ordinal = 0;
  const visit = (node: ts.Node): boolean => {
    if (node === declaration) return true;
    if (node !== owner && (ts.isFunctionLike(node) || ts.isClassLike(node))) return false;
    if (node.kind === declaration.kind && declarationBindingName(node) === name
      && fingerprint(node.getText().replace(/\s+/g, " ")) === fingerprint(declaration.getText().replace(/\s+/g, " "))) ordinal++;
    return node.getChildren().some(visit);
  };
  visit(owner);
  return ordinal;
}

function nearestIdentityScope(node: ts.Node | undefined): ts.Node | undefined {
  for (let cursor = node; cursor; cursor = cursor.parent) {
    if (ts.isSourceFile(cursor) || ts.isFunctionLike(cursor) || ts.isClassLike(cursor) || ts.isBlock(cursor)
      || ts.isCaseBlock(cursor) || ts.isCatchClause(cursor) || ts.isModuleBlock(cursor)) return cursor;
  }
  return undefined;
}

function diskFileVersion(filename: string): string {
  try {
    const stat = fs.statSync(filename, { bigint: true });
    return `disk:${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}`;
  } catch {
    return "disk:missing";
  }
}

function signatureFor(
  signature: ts.Signature,
  at: ts.Node,
  checker: ts.TypeChecker,
  typeFor: (type: ts.Type, at: ts.Node) => ExpressionType
): ExpressionCallSignature {
  const declaration = signature.getDeclaration() ?? at;
  return Object.freeze({
    display: checker.signatureToString(signature, at, ts.TypeFormatFlags.NoTruncation),
    parameters: Object.freeze(signature.getParameters().map((parameter, index) => {
      const parameterDeclaration = parameter.valueDeclaration ?? parameter.declarations?.[0] ?? declaration;
      const contextual = ts.isCallExpression(at) && at.arguments[index]
        ? checker.getContextualType(at.arguments[index]!)
        : undefined;
      return Object.freeze({
        name: parameter.name,
        type: typeFor(contextual ?? checker.getTypeOfSymbolAtLocation(parameter, at), at),
        optional: Boolean(parameter.flags & ts.SymbolFlags.Optional)
          || ts.isParameter(parameterDeclaration) && (!!parameterDeclaration.questionToken || !!parameterDeclaration.initializer),
        rest: ts.isParameter(parameterDeclaration) && !!parameterDeclaration.dotDotDotToken
      });
    })),
    returnType: typeFor(checker.getReturnTypeOfSignature(signature), declaration),
    typeParameters: Object.freeze((signature.typeParameters ?? []).map(parameter => checker.typeToString(parameter, declaration))),
    declarationSource: displayFile(declaration.getSourceFile().fileName)
  });
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isReadonlyArrayType(checker: ts.TypeChecker, type: ts.Type): boolean {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  if (symbol?.name === "ReadonlyArray") return true;
  return checker.typeToString(type).startsWith("readonly ") && Boolean(type.flags & ts.TypeFlags.Object);
}

export function createExpressionProject(options: ExpressionProjectOptions = {}): ExpressionProject {
  return new ExpressionProject(options);
}

/** Finds the nearest usable project configuration without exposing TypeScript. */
export function findExpressionConfig(cwd: string): string | undefined {
  return ts.findConfigFile(path.resolve(cwd), ts.sys.fileExists, "tsconfig.json");
}

function normalizeFile(filename: string): string {
  const normalized = displayFile(filename);
  return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
}

function displayFile(filename: string): string {
  return path.resolve(filename).replace(/\\/g, "/");
}

function scriptKind(filename: string): ts.ScriptKind {
  if (filename.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filename.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(filename)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isScopeNode(node: ts.Node): boolean {
  return ts.isSourceFile(node) || ts.isFunctionLike(node) || ts.isClassLike(node) || ts.isBlock(node)
    || ts.isModuleBlock(node) || ts.isCaseBlock(node) || ts.isCatchClause(node);
}

function scopeKind(node: ts.Node): ScopeKind {
  if (ts.isSourceFile(node) || ts.isModuleBlock(node)) return "module";
  if (ts.isFunctionLike(node)) return "function";
  if (ts.isClassLike(node)) return "class";
  if (ts.isCatchClause(node)) return "catch";
  return "block";
}

function category(node: ts.Node): NodeCategory {
  if (ts.isSourceFile(node)) return "module";
  if (isJsxNode(node)) return "jsx";
  if (ts.isTypeNode(node)) return "type";
  if (isDeclarationNode(node)) return "declaration";
  if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node) || ts.isBindingElement(node)) return "pattern";
  if (ts.isStatement(node)) return "statement";
  if (ts.isExpression(node)) return "expression";
  return "token";
}

function isJsxNode(node: ts.Node): boolean {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)
    || ts.isJsxExpression(node) || ts.isJsxAttribute(node) || ts.isJsxAttributes(node)
    || ts.isJsxOpeningElement(node) || ts.isJsxClosingElement(node) || ts.isJsxOpeningFragment(node)
    || ts.isJsxClosingFragment(node) || ts.isJsxSpreadAttribute(node) || ts.isJsxText(node);
}

function nodeName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isJsxText(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) || ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) return node.name.getText();
  if (ts.isElementAccessExpression(node) && (ts.isStringLiteralLike(node.argumentExpression) || ts.isNumericLiteral(node.argumentExpression))) return node.argumentExpression.text;
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxClosingElement(node)) return node.tagName.getText();
  if (hasNodeName(node) && node.name) return node.name.getText();
  return undefined;
}

function isDeclarationNode(node: ts.Node): boolean {
  return ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
    || ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isParameter(node)
    || ts.isImportDeclaration(node) || ts.isImportSpecifier(node) || ts.isNamespaceImport(node)
    || ts.isExportDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)
    || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
    || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeParameterDeclaration(node);
}

function hasNodeName(node: ts.Node): node is ts.Node & { name: ts.DeclarationName } {
  return "name" in node;
}

function nodeOperator(node: ts.Node): string | undefined {
  if (ts.isBinaryExpression(node)) return node.operatorToken.getText();
  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) return ts.tokenToString(node.operator);
  return undefined;
}

function collectBindingIdentifiers(name: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap(element => ts.isOmittedExpression(element) ? [] : collectBindingIdentifiers(element.name));
}

function declarationBindingName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (hasNodeName(node) && node.name && ts.isIdentifier(node.name)) return node.name.text;
  return undefined;
}

function isMutableBinding(node: ts.Node): boolean {
  if (ts.isParameter(node)) return node.name.getText() !== "this";
  if (ts.isBindingElement(node)) return isMutableBinding(node.parent.parent);
  if (ts.isVariableDeclaration(node)) {
    const declarations = node.parent;
    return ts.isVariableDeclarationList(declarations) && (declarations.flags & ts.NodeFlags.Const) === 0;
  }
  return false;
}

function importSource(node: ts.Node): string | undefined {
  let cursor: ts.Node | undefined = node;
  while (cursor && !ts.isImportDeclaration(cursor)) cursor = cursor.parent;
  return cursor && ts.isStringLiteral(cursor.moduleSpecifier) ? cursor.moduleSpecifier.text : undefined;
}

function isTypeOnlyBinding(node: ts.Node): boolean {
  let cursor: ts.Node | undefined = node;
  while (cursor && !ts.isImportDeclaration(cursor)) {
    if (ts.isImportSpecifier(cursor) && cursor.isTypeOnly) return true;
    cursor = cursor.parent;
  }
  return !!cursor?.importClause?.isTypeOnly;
}

function typeKind(type: ts.Type): ExpressionTypeKind {
  const flags = type.flags;
  if (flags & ts.TypeFlags.Any) return "any";
  if (flags & ts.TypeFlags.Unknown) return "unknown";
  if (flags & ts.TypeFlags.Never) return "never";
  if (flags & ts.TypeFlags.Void) return "void";
  if (flags & ts.TypeFlags.Undefined) return "undefined";
  if (flags & ts.TypeFlags.Null) return "null";
  if (flags & ts.TypeFlags.BooleanLike) return "boolean";
  if (flags & ts.TypeFlags.NumberLike) return "number";
  if (flags & ts.TypeFlags.BigIntLike) return "bigint";
  if (flags & ts.TypeFlags.StringLike) return "string";
  if (flags & ts.TypeFlags.ESSymbolLike) return "symbol";
  if (flags & ts.TypeFlags.Union) return "union";
  if (flags & ts.TypeFlags.Intersection) return "intersection";
  if (flags & ts.TypeFlags.TypeParameter) return "type-parameter";
  return type.getCallSignatures().length ? "function" : "object";
}

function diagnosticFromTs(diagnostic: ts.Diagnostic): ExpressionDiagnostic {
  const source = diagnostic.file;
  const start = diagnostic.start;
  let span: SourceSpan | undefined;
  if (source && start !== undefined) {
    const line = source.getLineAndCharacterOfPosition(start);
    span = Object.freeze({ start, end: start + (diagnostic.length ?? 0), line: line.line + 1, column: line.character + 1 });
  }
  return Object.freeze({
    code: `TS${diagnostic.code}`,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
    ...(source ? { filename: normalizeFile(source.fileName) } : {}),
    ...(span ? { span } : {})
  });
}

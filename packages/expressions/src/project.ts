import ts from "typescript";
import path from "node:path";
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
    super(diagnostics.map(diagnostic => diagnostic.message).join("\n"));
    this.name = "ExpressionProjectError";
  }
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
  constructor(readonly symbol: ExpressionSymbol, name: string, kind: string, scope: ExpressionScope, readonly synthetic = false) {
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
    readonly unionMembers: readonly ExpressionType[],
    readonly callSignatures: readonly ExpressionCallSignature[],
    readonly typeArguments: readonly ExpressionType[],
    readonly typeParameters: readonly string[]
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
  private program?: ts.Program;

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
    if (source.id === target.id || target.kind === "any" || target.kind === "unknown" || source.kind === "never") return true;
    if (target.kind === "union") return target.unionMembers.some(member => this.isAssignable(source, member));
    if (source.kind === "union") return source.unionMembers.every(member => this.isAssignable(member, target));
    return source.display === target.display;
  }

  private rebuild(): void {
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
        const cached = thisProject.sourceFiles.get(normalized);
        if (cached?.version === "disk") return cached.sourceFile;
        const created = base.getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
        if (created) thisProject.sourceFiles.set(normalized, { version: "disk", sourceFile: created });
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
    const symbolIdentity = (id: string, name: string): ExpressionSymbol => {
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
      const key = `${type.flags}:${display}`;
      // Install a cycle breaker before expanding recursive union members.
      const placeholder: ExpressionType = Object.freeze({
        id: `type:${key}`, kind: typeKind(type), display,
        nullable: false, callable: type.getCallSignatures().length > 0,
        properties: Object.freeze([]), unionMembers: Object.freeze([]),
        callSignatures: Object.freeze([]), typeArguments: Object.freeze([]), typeParameters: Object.freeze([])
      });
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
              optional: Boolean(parameter.flags & ts.SymbolFlags.Optional),
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
      const value = new ProjectType(
        `type:${key}`,
        typeKind(type),
        display,
        Boolean(type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) || members.some(member => member.nullable),
        type.getCallSignatures().length > 0,
        Object.freeze(type.getProperties().map(property => property.name)),
        Object.freeze(members),
        Object.freeze(signatures),
        Object.freeze(typeArguments),
        Object.freeze(typeParameters)
      );
      typeCache.set(type, value);
      return value;
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
      const scope = scopeFor(declaration);
      const variable = new ProjectVariable(symbolIdentity(key, localName), localName, ts.SyntaxKind[declaration.kind], scope);
      symbolVariables.set(symbol, variable);
      let variableType: ExpressionType | undefined;
      try { variableType = typeFor(checker.getTypeOfSymbolAtLocation(symbol, identifier), identifier); } catch { /* TypeScript can reject incomplete error symbols. */ }
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
        return Object.freeze({ ...common, target, arguments: Object.freeze(children.slice(1)) });
      }
      if (ts.isFunctionLike(node)) {
        const parameters = node.parameters.flatMap(parameter => parameter.name.getText(sourceFile) === "this"
          ? [variableForThis(parameter.name)]
          : collectBindingIdentifiers(parameter.name).map(variableFor).filter((value): value is Variable => !!value));
        return Object.freeze({ ...common, parameters: Object.freeze(parameters), captures: Object.freeze([]) });
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
    return module;
  }
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
    if (ts.isFunctionLike(cursor) || ts.isClassLike(cursor) || ts.isModuleDeclaration(cursor)) {
      const named = hasNodeName(cursor) && cursor.name ? cursor.name.getText() : undefined;
      scopes.push(named ? `${ts.SyntaxKind[cursor.kind]}:${named}` : `${ts.SyntaxKind[cursor.kind]}:${fingerprint(cursor.getText().replace(/\s+/g, " "))}`);
    }
    cursor = cursor.parent;
  }
  return `${filename}:${scopes.reverse().join("/")}:${ts.SyntaxKind[declaration.kind]}:${name}`;
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
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

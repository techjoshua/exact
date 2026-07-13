import ts from "typescript";
import path from "node:path";
import type {
  ExpressionDiagnostic,
  ExpressionNode,
  ExpressionScope,
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
  private owned: Variable[] = [];
  constructor(readonly id: string, readonly kind: ScopeKind, readonly parent?: ExpressionScope) {}
  get variables(): readonly Variable[] { return this.owned; }
  add(variable: Variable): void { if (!this.owned.includes(variable)) this.owned.push(variable); }
}

class ProjectVariable implements Variable {
  private currentScope: ExpressionScope;
  private currentType?: ExpressionType;
  private currentName: string;
  private currentKind: string;
  private currentExported = false;
  private currentImport?: string;
  readonly synthetic = false;

  constructor(readonly id: string, name: string, kind: string, scope: ExpressionScope) {
    this.currentName = name;
    this.currentKind = kind;
    this.currentScope = scope;
  }

  get name(): string { return this.currentName; }
  get declarationKind(): string { return this.currentKind; }
  get scope(): ExpressionScope { return this.currentScope; }
  get type(): ExpressionType | undefined { return this.currentType; }
  get exported(): boolean { return this.currentExported; }
  get importedFrom(): string | undefined { return this.currentImport; }

  update(data: { name: string; kind: string; scope: ExpressionScope; type?: ExpressionType; exported: boolean; importedFrom?: string }): void {
    this.currentName = data.name;
    this.currentKind = data.kind;
    this.currentScope = data.scope;
    this.currentType = data.type;
    this.currentExported = data.exported;
    this.currentImport = data.importedFrom;
  }
}

class ProjectType implements ExpressionType {
  kind: ExpressionTypeKind = "unknown";
  display = "unknown";
  nullable = false;
  callable = false;
  properties: readonly string[] = Object.freeze([]);
  unionMembers: readonly ExpressionType[] = Object.freeze([]);
  constructor(readonly id: string) {}
  update(data: Omit<ExpressionType, "id">): void {
    this.kind = data.kind;
    this.display = data.display;
    this.nullable = data.nullable;
    this.callable = data.callable;
    this.properties = data.properties;
    this.unionMembers = data.unionMembers;
  }
}

/** Project-aware TypeScript bridge. No TypeScript compiler objects escape this class. */
export class ExpressionProject {
  readonly tsconfigPath: string;
  private readonly parsed: ts.ParsedCommandLine;
  private readonly overlays = new Map<string, string>();
  private readonly variables = new Map<string, ProjectVariable>();
  private readonly types = new Map<string, ProjectType>();
  private program?: ts.Program;

  constructor(options: ExpressionProjectOptions = {}) {
    const cwd = path.resolve(options.cwd ?? process.cwd());
    const config = options.tsconfigPath
      ? path.resolve(cwd, options.tsconfigPath)
      : ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
    if (!config) throw new ExpressionProjectError([{ code: "EXPR_CONFIG_MISSING", message: `No tsconfig.json found from ${cwd}`, severity: "error" }]);
    this.tsconfigPath = config;
    const read = ts.readConfigFile(config, ts.sys.readFile);
    if (read.error) throw new ExpressionProjectError([diagnosticFromTs(read.error)]);
    this.parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config), undefined, config);
    if (this.parsed.errors.length) throw new ExpressionProjectError(this.parsed.errors.map(diagnosticFromTs));
  }

  updateModule(filename: string, source: string): BoundModule {
    const normalized = normalizeFile(filename);
    this.overlays.set(normalized, source);
    this.rebuild();
    return this.readBoundModule(normalized);
  }

  getModule(filename: string, source?: string): BoundModule {
    const normalized = normalizeFile(filename);
    if (source !== undefined) return this.updateModule(normalized, source);
    if (!this.program) this.rebuild();
    return this.readBoundModule(normalized);
  }

  async bind(module: UnboundModule): Promise<BoundModule> {
    const emitted = module.emit({ format: "generated" }).code;
    return this.updateModule(module.filename, emitted);
  }

  emit(module: BoundModule, options: Parameters<BoundModule["emit"]>[0] = {}) {
    return module.emit(options);
  }

  isAssignable(source: ExpressionType, target: ExpressionType): boolean {
    if (source.id === target.id || target.kind === "any" || target.kind === "unknown" || source.kind === "never") return true;
    if (target.kind === "union") return target.unionMembers.some(member => this.isAssignable(source, member));
    if (source.kind === "union") return source.unionMembers.every(member => this.isAssignable(member, target));
    return source.display === target.display;
  }

  private rebuild(): void {
    const roots = new Set(this.parsed.fileNames.map(normalizeFile));
    for (const file of this.overlays.keys()) roots.add(file);
    const base = ts.createCompilerHost(this.parsed.options, true);
    const overlays = this.overlays;
    const host: ts.CompilerHost = {
      ...base,
      fileExists(file) { return overlays.has(normalizeFile(file)) || base.fileExists(file); },
      readFile(file) { return overlays.get(normalizeFile(file)) ?? base.readFile(file); },
      getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile) {
        const normalized = normalizeFile(file);
        const source = overlays.get(normalized);
        if (source !== undefined) return ts.createSourceFile(file, source, languageVersion, true, scriptKind(file));
        return base.getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
      }
    };
    this.program = ts.createProgram({ rootNames: [...roots], options: this.parsed.options, host, oldProgram: this.program });
  }

  private readBoundModule(filename: string): BoundModule {
    const program = this.program!;
    const sourceFile = program.getSourceFile(filename) ?? program.getSourceFiles().find(file => normalizeFile(file.fileName) === filename);
    if (!sourceFile) throw new ExpressionProjectError([{ code: "EXPR_FILE_MISSING", message: `Module is not part of the expression project: ${filename}`, severity: "error", filename }]);
    const checker = program.getTypeChecker();
    const scopes = new Map<ts.Node, ProjectScope>();
    const symbolVariables = new Map<ts.Symbol, ProjectVariable>();
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile)
    ].map(diagnosticFromTs);

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
      const display = checker.typeToString(type, at, ts.TypeFormatFlags.NoTruncation);
      const key = `${type.flags}:${display}`;
      const value = this.types.get(key) ?? new ProjectType(`type:${key}`);
      if (!this.types.has(key)) this.types.set(key, value);
      const members = type.isUnionOrIntersection() ? type.types.map(member => typeFor(member, at)) : [];
      value.update({
        kind: typeKind(type),
        display,
        nullable: Boolean(type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) || members.some(member => member.nullable),
        callable: type.getCallSignatures().length > 0,
        properties: Object.freeze(type.getProperties().map(property => property.name)),
        unionMembers: Object.freeze(members)
      });
      return value;
    };

    const variableFor = (identifier: ts.Identifier): Variable | undefined => {
      const symbol = checker.getSymbolAtLocation(identifier);
      if (!symbol) return undefined;
      const cached = symbolVariables.get(symbol);
      if (cached) return cached;
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? identifier;
      const declarationFile = normalizeFile(declaration.getSourceFile().fileName);
      const key = `${declarationFile}:${declaration.getStart()}:${symbol.name}`;
      const scope = scopeFor(declaration);
      const variable = this.variables.get(key) ?? new ProjectVariable(key, symbol.name, ts.SyntaxKind[declaration.kind], scope);
      this.variables.set(key, variable);
      symbolVariables.set(symbol, variable);
      let variableType: ExpressionType | undefined;
      try { variableType = typeFor(checker.getTypeOfSymbolAtLocation(symbol, identifier), identifier); } catch { /* TypeScript can reject incomplete error symbols. */ }
      variable.update({
        name: symbol.name,
        kind: ts.SyntaxKind[declaration.kind],
        scope,
        type: variableType,
        exported: Boolean(symbol.flags & ts.SymbolFlags.ExportValue),
        importedFrom: importSource(declaration)
      });
      scope.add(variable);
      return variable;
    };

    let nodeSequence = 0;
    const convert = (node: ts.Node): ExpressionNode => {
      const children: ExpressionNode[] = [];
      ts.forEachChild(node, child => {
        if (!ts.isTypeNode(child)) children.push(convert(child));
      });
      const start = node.getStart(sourceFile, false);
      const line = sourceFile.getLineAndCharacterOfPosition(start);
      const span: SourceSpan = Object.freeze({ start, end: node.end, line: line.line + 1, column: line.character + 1 });
      let semanticType: ExpressionType | undefined;
      if (ts.isExpression(node)) {
        try { semanticType = typeFor(checker.getTypeAtLocation(node), node); } catch { /* Invalid code is represented alongside diagnostics. */ }
      }
      const variable = ts.isIdentifier(node) ? variableFor(node) : undefined;
      const common: ExpressionNode = {
        id: `${filename}:node:${start}:${node.end}:${ts.SyntaxKind[node.kind]}:${nodeSequence++}`,
        kind: ts.SyntaxKind[node.kind],
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
        const parameters = node.parameters.flatMap(parameter => collectBindingIdentifiers(parameter.name).map(variableFor).filter((value): value is Variable => !!value));
        return Object.freeze({ ...common, parameters: Object.freeze(parameters), captures: Object.freeze([]) });
      }
      return Object.freeze(common);
    };

    const root = convert(sourceFile);
    const module = createModule({ filename, source: sourceFile.text, root, state: "bound", diagnostics });
    return module;
  }
}

export function createExpressionProject(options: ExpressionProjectOptions = {}): ExpressionProject {
  return new ExpressionProject(options);
}

function normalizeFile(filename: string): string {
  return path.resolve(filename).replace(/\\/g, "/");
}

function scriptKind(filename: string): ts.ScriptKind {
  if (filename.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filename.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filename.endsWith(".js")) return ts.ScriptKind.JS;
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
    || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);
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

function importSource(node: ts.Node): string | undefined {
  let cursor: ts.Node | undefined = node;
  while (cursor && !ts.isImportDeclaration(cursor)) cursor = cursor.parent;
  return cursor && ts.isStringLiteral(cursor.moduleSpecifier) ? cursor.moduleSpecifier.text : undefined;
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

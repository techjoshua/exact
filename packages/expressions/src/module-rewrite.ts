import ts from "typescript";
import { createLineSourceMap } from "./source-map.js";

export interface ModuleExportReplacement {
  readonly sourceModule: string;
  readonly sourceExport: string;
  readonly targetModule: string;
  readonly targetExport: string;
}

export interface ModuleRewriteOptions {
  readonly filename?: string;
  readonly moduleAliases?: Readonly<Record<string, string>>;
  readonly replacements?: readonly ModuleExportReplacement[];
  readonly sourceMap?: boolean;
}

export interface ModuleRewriteResult {
  readonly code: string;
  readonly map: unknown;
  readonly filename: string;
  readonly changed: boolean;
}

/**
 * Rewrites module references in one structural pass. Unmapped bindings stay on
 * their original module and mapped bindings are grouped by public target export.
 */
export function rewriteModuleReferences(source: string, options: ModuleRewriteOptions = {}): ModuleRewriteResult {
  const filename = options.filename ?? "input.js";
  const { sourceFile, checker } = bindSourceFile(filename, source);
  const aliases = options.moduleAliases ?? {};
  const replacements = replacementIndex(options.replacements ?? []);
  let changed = false;

  const result = ts.transform(sourceFile, [context => {
    const factory = context.factory;
    const namespaceImports = new Map<ts.Symbol, ReadonlyMap<string, ModuleExportReplacement>>();
    const injectedImports = new Map<string, { targetModule: string; targetExport: string; local: ts.Identifier }>();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const bindings = statement.importClause?.namedBindings;
      const byExport = replacements.get(statement.moduleSpecifier.text);
      if (!byExport || !bindings || !ts.isNamespaceImport(bindings)) continue;
      const symbol = checker.getSymbolAtLocation(bindings.name);
      if (symbol) namespaceImports.set(symbol, byExport);
    }
    const visitor: ts.Visitor = node => {
      if (ts.isVariableStatement(node)) {
        const rewritten = rewriteCommonJsDestructuring(factory, node, replacements);
        if (rewritten !== node) { changed = true; return rewritten; }
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const sourceModule = node.moduleSpecifier.text;
        const aliased = aliases[sourceModule];
        if (aliased) {
          changed = true;
          return factory.updateImportDeclaration(node, node.modifiers, node.importClause, factory.createStringLiteral(aliased), node.attributes);
        }
        const byExport = replacements.get(sourceModule);
        if (!byExport || !node.importClause || node.importClause.isTypeOnly) return node;
        const rewritten = rewriteImportDeclaration(factory, node, byExport);
        if (rewritten !== node) changed = true;
        return rewritten;
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const sourceModule = node.moduleSpecifier.text;
        const aliased = aliases[sourceModule];
        if (aliased) {
          changed = true;
          return factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, factory.createStringLiteral(aliased), node.attributes);
        }
        const byExport = replacements.get(sourceModule);
        if (!byExport || !node.exportClause || !ts.isNamedExports(node.exportClause) || node.isTypeOnly) return node;
        const rewritten = rewriteExportDeclaration(factory, node, byExport);
        if (rewritten !== node) changed = true;
        return rewritten;
      }
      if (isModuleCall(node)) {
        const request = node.arguments[0];
        const aliased = aliases[request.text];
        if (aliased) {
          changed = true;
          return factory.updateCallExpression(node, node.expression, node.typeArguments, [factory.createStringLiteral(aliased), ...node.arguments.slice(1)]);
        }
      }
      if (ts.isPropertyAccessExpression(node) && isRequireCall(node.expression)) {
        const request = node.expression.arguments[0];
        const replacement = replacements.get(request.text)?.get(node.name.text);
        if (replacement) {
          changed = true;
          return factory.createPropertyAccessExpression(
            factory.updateCallExpression(node.expression, node.expression.expression, node.expression.typeArguments, [factory.createStringLiteral(replacement.targetModule)]),
            replacement.targetExport
          );
        }
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
        const replacement = namespaceImports.get(checker.getSymbolAtLocation(node.expression)!)?.get(node.name.text);
        if (replacement) {
          changed = true;
          return injectedAdapterImport(factory, injectedImports, replacement);
        }
      }
      if (ts.isElementAccessExpression(node) && isRequireCall(node.expression) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
        const request = node.expression.arguments[0];
        const replacement = replacements.get(request.text)?.get(node.argumentExpression.text);
        if (replacement) {
          changed = true;
          return factory.createElementAccessExpression(
            factory.updateCallExpression(node.expression, node.expression.expression, node.expression.typeArguments, [factory.createStringLiteral(replacement.targetModule)]),
            factory.createStringLiteral(replacement.targetExport)
          );
        }
      }
      if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
        const replacement = namespaceImports.get(checker.getSymbolAtLocation(node.expression)!)?.get(node.argumentExpression.text);
        if (replacement) {
          changed = true;
          return injectedAdapterImport(factory, injectedImports, replacement);
        }
      }
      return ts.visitEachChild(node, visitor, context);
    };
    return root => {
      const visited = ts.visitEachChild(root, visitor, context);
      if (!injectedImports.size) return visited;
      const imports = [...injectedImports.values()].map(value => factory.createImportDeclaration(
        undefined,
        factory.createImportClause(false, undefined, factory.createNamedImports([
          factory.createImportSpecifier(false, factory.createIdentifier(value.targetExport), value.local)
        ])),
        factory.createStringLiteral(value.targetModule),
        undefined
      ));
      const directiveCount = visited.statements.findIndex(statement => !ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression));
      const split = directiveCount < 0 ? visited.statements.length : directiveCount;
      return factory.updateSourceFile(visited, [
        ...visited.statements.slice(0, split),
        ...imports,
        ...visited.statements.slice(split)
      ]);
    };
  }]);

  const transformed = result.transformed[0] as ts.SourceFile;
  const code = changed ? ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(transformed) : source;
  result.dispose();
  return {
    code,
    map: options.sourceMap === false || !changed ? null : createLineSourceMap(filename, source, code),
    filename,
    changed
  };
}

function rewriteCommonJsDestructuring(
  factory: ts.NodeFactory,
  node: ts.VariableStatement,
  replacements: ReadonlyMap<string, ReadonlyMap<string, ModuleExportReplacement>>
): ts.VariableStatement {
  const declarations: ts.VariableDeclaration[] = [];
  let changed = false;
  for (const declaration of node.declarationList.declarations) {
    if (!ts.isObjectBindingPattern(declaration.name) || !declaration.initializer || !isRequireCall(declaration.initializer)) {
      declarations.push(declaration);
      continue;
    }
    const request = declaration.initializer.arguments[0].text;
    const byExport = replacements.get(request);
    if (!byExport) { declarations.push(declaration); continue; }
    const retained: ts.BindingElement[] = [];
    const grouped = new Map<string, { replacement: ModuleExportReplacement; elements: ts.BindingElement[] }>();
    for (const element of declaration.name.elements) {
      if (element.dotDotDotToken) { retained.push(element); continue; }
      const sourceExport = element.propertyName && (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName))
        ? element.propertyName.text
        : ts.isIdentifier(element.name) ? element.name.text : undefined;
      const replacement = sourceExport ? byExport.get(sourceExport) : undefined;
      if (!replacement) { retained.push(element); continue; }
      changed = true;
      let group = grouped.get(replacement.targetModule);
      if (!group) { group = { replacement, elements: [] }; grouped.set(replacement.targetModule, group); }
      group.elements.push(factory.updateBindingElement(
        element,
        element.dotDotDotToken,
        factory.createIdentifier(replacement.targetExport),
        element.name,
        element.initializer
      ));
    }
    if (retained.length) declarations.push(factory.updateVariableDeclaration(
      declaration,
      factory.createObjectBindingPattern(retained),
      declaration.exclamationToken,
      declaration.type,
      declaration.initializer
    ));
    for (const group of [...grouped.values()].sort((left, right) => left.replacement.targetModule.localeCompare(right.replacement.targetModule))) {
      declarations.push(factory.createVariableDeclaration(
        factory.createObjectBindingPattern(group.elements),
        undefined,
        declaration.type,
        factory.createCallExpression(factory.createIdentifier("require"), undefined, [factory.createStringLiteral(group.replacement.targetModule)])
      ));
    }
  }
  return changed
    ? factory.updateVariableStatement(node, node.modifiers, factory.updateVariableDeclarationList(node.declarationList, declarations))
    : node;
}

function injectedAdapterImport(
  factory: ts.NodeFactory,
  imports: Map<string, { targetModule: string; targetExport: string; local: ts.Identifier }>,
  replacement: ModuleExportReplacement
): ts.Identifier {
  const key = `${replacement.targetModule}\0${replacement.targetExport}`;
  let value = imports.get(key);
  if (!value) {
    value = {
      targetModule: replacement.targetModule,
      targetExport: replacement.targetExport,
      local: factory.createUniqueName(`__exact_${safeIdentifier(replacement.targetExport)}`)
    };
    imports.set(key, value);
  }
  return value.local;
}

function bindSourceFile(filename: string, source: string): { sourceFile: ts.SourceFile; checker: ts.TypeChecker } {
  const normalized = pathKey(filename);
  let entry = rewritePrograms.get(normalized);
  if (!entry) {
    entry = createRewriteProgram(filename, normalized);
    rewritePrograms.set(normalized, entry);
    if (rewritePrograms.size > 64) rewritePrograms.delete(rewritePrograms.keys().next().value!);
  }
  if (entry.source === source && entry.program && entry.sourceFile) {
    return { sourceFile: entry.sourceFile, checker: entry.program.getTypeChecker() };
  }
  entry.source = source;
  entry.sourceFile = undefined;
  entry.program = ts.createProgram({
    rootNames: [filename],
    options: entry.compilerOptions,
    host: entry.host,
    oldProgram: entry.program
  });
  const sourceFile = entry.program.getSourceFile(filename);
  if (!sourceFile) throw new Error(`Unable to parse ${filename}`);
  entry.sourceFile = sourceFile;
  return { sourceFile, checker: entry.program.getTypeChecker() };
}

type RewriteProgramEntry = {
  source?: string;
  sourceFile?: ts.SourceFile;
  program?: ts.Program;
  compilerOptions: ts.CompilerOptions;
  host: ts.CompilerHost;
};

const rewritePrograms = new Map<string, RewriteProgramEntry>();

function createRewriteProgram(filename: string, normalized: string): RewriteProgramEntry {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    noLib: true,
    noResolve: true,
    allowJs: true
  };
  const entry = { compilerOptions } as RewriteProgramEntry;
  const host = ts.createCompilerHost(compilerOptions, true);
  host.fileExists = file => pathKey(file) === normalized;
  host.readFile = file => pathKey(file) === normalized ? entry.source : undefined;
  host.getSourceFile = (file, languageVersion) => pathKey(file) === normalized
    ? ts.createSourceFile(filename, entry.source ?? "", languageVersion, true, scriptKind(filename))
    : undefined;
  host.writeFile = () => {};
  entry.host = host;
  return entry;
}

function pathKey(value: string): string { return value.replaceAll("\\", "/").toLowerCase(); }
function safeIdentifier(value: string): string { return value.replace(/[^$A-Z_a-z0-9]/g, "_"); }

function rewriteImportDeclaration(
  factory: ts.NodeFactory,
  node: ts.ImportDeclaration,
  replacements: ReadonlyMap<string, ModuleExportReplacement>
): ts.ImportDeclaration | readonly ts.ImportDeclaration[] {
  const clause = node.importClause!;
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) return node;
  const retained: ts.ImportSpecifier[] = [];
  const grouped = new Map<string, { targetModule: string; specifiers: ts.ImportSpecifier[]; defaultName?: ts.Identifier }>();
  let defaultName = clause.name;
  const defaultReplacement = clause.name ? replacements.get("default") : undefined;
  if (defaultReplacement && clause.name) {
    const group = targetGroup(grouped, defaultReplacement.targetModule);
    if (defaultReplacement.targetExport === "default") group.defaultName = clause.name;
    else group.specifiers.push(factory.createImportSpecifier(false, factory.createIdentifier(defaultReplacement.targetExport), clause.name));
    defaultName = undefined;
  }
  const namedBindings = clause.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings : undefined;
  for (const specifier of namedBindings?.elements ?? []) {
    if (specifier.isTypeOnly) { retained.push(specifier); continue; }
    const sourceExport = specifier.propertyName?.text ?? specifier.name.text;
    const replacement = replacements.get(sourceExport);
    if (!replacement) { retained.push(specifier); continue; }
    const group = targetGroup(grouped, replacement.targetModule);
    if (replacement.targetExport === "default") {
      if (group.defaultName) throw new Error(`Cannot map multiple imports to the default export of ${replacement.targetModule}`);
      group.defaultName = specifier.name;
    } else {
      group.specifiers.push(factory.createImportSpecifier(false, factory.createIdentifier(replacement.targetExport), specifier.name));
    }
  }
  if (!defaultReplacement && retained.length === (namedBindings?.elements.length ?? 0)) return node;
  const declarations: ts.ImportDeclaration[] = [];
  if (defaultName || retained.length) {
    declarations.push(factory.updateImportDeclaration(
      node,
      node.modifiers,
      factory.updateImportClause(clause, false, defaultName, retained.length ? factory.createNamedImports(retained) : undefined),
      node.moduleSpecifier,
      node.attributes
    ));
  }
  for (const group of [...grouped.values()].sort((left, right) => left.targetModule.localeCompare(right.targetModule))) {
    declarations.push(factory.createImportDeclaration(
      undefined,
      factory.createImportClause(false, group.defaultName, group.specifiers.length ? factory.createNamedImports(group.specifiers) : undefined),
      factory.createStringLiteral(group.targetModule),
      undefined
    ));
  }
  return declarations;
}

function rewriteExportDeclaration(
  factory: ts.NodeFactory,
  node: ts.ExportDeclaration,
  replacements: ReadonlyMap<string, ModuleExportReplacement>
): ts.ExportDeclaration | readonly ts.ExportDeclaration[] {
  const retained: ts.ExportSpecifier[] = [];
  const grouped = new Map<string, ts.ExportSpecifier[]>();
  for (const specifier of (node.exportClause as ts.NamedExports).elements) {
    if (specifier.isTypeOnly) { retained.push(specifier); continue; }
    const sourceExport = specifier.propertyName?.text ?? specifier.name.text;
    const replacement = replacements.get(sourceExport);
    if (!replacement) { retained.push(specifier); continue; }
    const values = grouped.get(replacement.targetModule) ?? [];
    values.push(factory.createExportSpecifier(false, factory.createIdentifier(replacement.targetExport), specifier.name));
    grouped.set(replacement.targetModule, values);
  }
  if (retained.length === (node.exportClause as ts.NamedExports).elements.length) return node;
  const declarations: ts.ExportDeclaration[] = [];
  if (retained.length) declarations.push(factory.updateExportDeclaration(node, node.modifiers, false, factory.createNamedExports(retained), node.moduleSpecifier, node.attributes));
  for (const [targetModule, specifiers] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    declarations.push(factory.createExportDeclaration(undefined, false, factory.createNamedExports(specifiers), factory.createStringLiteral(targetModule), undefined));
  }
  return declarations;
}

function replacementIndex(values: readonly ModuleExportReplacement[]): Map<string, Map<string, ModuleExportReplacement>> {
  const result = new Map<string, Map<string, ModuleExportReplacement>>();
  for (const value of values) {
    let exports = result.get(value.sourceModule);
    if (!exports) { exports = new Map(); result.set(value.sourceModule, exports); }
    if (exports.has(value.sourceExport)) throw new Error(`Duplicate module replacement for ${value.sourceModule}.${value.sourceExport}`);
    exports.set(value.sourceExport, value);
  }
  return result;
}

function targetGroup(
  grouped: Map<string, { targetModule: string; specifiers: ts.ImportSpecifier[]; defaultName?: ts.Identifier }>,
  targetModule: string
): { targetModule: string; specifiers: ts.ImportSpecifier[]; defaultName?: ts.Identifier } {
  let group = grouped.get(targetModule);
  if (!group) { group = { targetModule, specifiers: [] }; grouped.set(targetModule, group); }
  return group;
}

function isModuleCall(node: ts.Node): node is ts.CallExpression & { arguments: [ts.StringLiteral, ...ts.Expression[]] } {
  return ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])
    && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require");
}

function isRequireCall(node: ts.Node): node is ts.CallExpression & { arguments: [ts.StringLiteral] } {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require"
    && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]);
}

function scriptKind(filename: string): ts.ScriptKind {
  const clean = filename.split("?", 1)[0]!;
  if (/\.tsx$/i.test(clean)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(clean)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/i.test(clean)) return ts.ScriptKind.JS;
  if (/\.json$/i.test(clean)) return ts.ScriptKind.JSON;
  return ts.ScriptKind.TS;
}

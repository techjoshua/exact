import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  collectStateAliases,
  stateEffectPath,
  uniqueContextEffects,
  uniqueEffects
} from "./state-analysis.js";
import {
  buildSemanticGraph,
  createSemanticDeclarationIndex,
  createSemanticReferenceIndex
} from "./semantic.js";

function analyze(text: string) {
  const sourceFile = ts.createSourceFile("sample.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const graph = buildSemanticGraph(sourceFile);
  return {
    sourceFile,
    graph,
    declarations: createSemanticDeclarationIndex(sourceFile, graph),
    references: createSemanticReferenceIndex(sourceFile, graph)
  };
}

function firstFunction(sourceFile: ts.SourceFile): ts.FunctionDeclaration {
  let result: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node): void {
    if (!result && ts.isFunctionDeclaration(node)) result = node;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!result) throw new Error("Expected function declaration");
  return result;
}

function aliasesByName(text: string): Record<string, string> {
  const { sourceFile, graph, references, declarations } = analyze(text);
  const component = firstFunction(sourceFile);
  const aliases = collectStateAliases(component, sourceFile, references, declarations);
  const declarationNames = new Map(graph.declarations.map(declaration => [declaration.id, declaration.name]));
  return Object.fromEntries([...aliases].map(([id, path]) => [declarationNames.get(id) ?? id, path]));
}

describe("state analysis helpers", () => {
  it("tracks state aliases through object and array destructuring", () => {
    expect(aliasesByName(`
      function Component() {
        const project = this.state.project;
        const { title, owner: { name } } = project;
        const [first] = this.state.items;
      }
    `)).toEqual({
      project: "project",
      title: "project.title",
      name: "project.owner.name",
      first: "items.0"
    });
  });

  it("resolves property and element paths through aliases", () => {
    const { sourceFile, references, declarations } = analyze(`
      function Component() {
        const project = this.state.project;
        const title = project["title"];
      }
    `);
    const declaration = [...sourceFile.statements].find(ts.isFunctionDeclaration)!;
    const aliases = collectStateAliases(declaration, sourceFile, references, declarations);
    const initializer = declaration.body!.statements
      .filter(ts.isVariableStatement)[1]!
      .declarationList.declarations[0]!
      .initializer!;
    expect(stateEffectPath(initializer, sourceFile, references, aliases)).toBe("project.title");
  });

  it("deduplicates and sorts state and context effects", () => {
    expect(uniqueEffects([
      { kind: "write", path: "title", confidence: "exact" },
      { kind: "read", path: "owner", confidence: "exact" },
      { kind: "write", path: "title", confidence: "exact" }
    ])).toEqual([
      { kind: "read", path: "owner", confidence: "exact" },
      { kind: "write", path: "title", confidence: "exact" }
    ]);

    expect(uniqueContextEffects([
      { kind: "write", token: "SessionContext", confidence: "exact" },
      { kind: "read", token: "SessionContext", confidence: "exact" },
      { kind: "read", token: "SessionContext", confidence: "exact" }
    ])).toEqual([
      { kind: "read", token: "SessionContext", confidence: "exact" },
      { kind: "write", token: "SessionContext", confidence: "exact" }
    ]);
  });
});

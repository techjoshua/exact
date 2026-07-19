import ts from "typescript";
import type { HelperNames } from "../types.js";

const helperBases: Readonly<Record<keyof HelperNames, string>> = {
  element: "__exactVNode",
  fragment: "__exactFragment",
  expression: "__exactExpression",
  dynamic: "__exactDynamic",
  derived: "__exactDerived",
  boundary: "__exactBoundary",
  write: "__exactWrite",
  update: "__exactUpdate",
  updateResult: "__exactUpdateResult",
  abortOptions: "__exactAbortOptions",
  taskSignal: "__exactSignal",
  taskTimeout: "__exactTaskTimeout",
  taskInterval: "__exactTaskInterval",
  taskAnimationFrame: "__exactTaskAnimationFrame",
  taskIdleCallback: "__exactTaskIdleCallback",
  taskObserver: "__exactTaskObserver",
  taskFetch: "__exactTaskFetch",
  taskResource: "__exactTaskResource",
  taskOptionsSignal: "__exactTaskOptionsSignal",
  taskCombinedSignal: "__exactTaskCombinedSignal",
  taskAwait: "__exactTaskAwait",
  remove: "__exactDelete",
  arrayMutation: "__exactArrayMutation"
};

/**
 * Allocates collision-free runtime helper bindings for one transformed module.
 */
export function allocateHelperNames(sourceFile: ts.SourceFile): HelperNames {
  const used = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) used.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return Object.fromEntries(
    Object.entries(helperBases).map(([key, base]) => [key, allocateName(base, used)])
  ) as HelperNames;
}

/**
 * Inserts a generated statement after the source file's directive prologue.
 *
 * Directives must remain the first statements or JavaScript changes their
 * semantics, most notably for `"use client"` and strict mode.
 */
export function insertAfterDirectivePrologue(
  statements: ts.NodeArray<ts.Statement>,
  statement: ts.Statement
): ts.Statement[] {
  const nextStatements = [...statements];
  let index = 0;
  while (index < nextStatements.length && isDirectivePrologueStatement(nextStatements[index]!)) {
    index++;
  }
  nextStatements.splice(index, 0, statement);
  return nextStatements;
}

function allocateName(base: string, used: Set<string>): string {
  let name = base;
  let index = 1;
  while (used.has(name)) name = `${base}_${index++}`;
  used.add(name);
  return name;
}

function isDirectivePrologueStatement(statement: ts.Statement): boolean {
  return ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
}

export {
  isAssignmentExpression,
  isCallExpression,
  isFunctionExpression,
  isJsxExpression,
  type AssignmentExpressionNode,
  type CallExpressionNode,
  type EmitOptions,
  type EmitResult,
  type ExpressionDiagnostic,
  type ExpressionNode,
  type ExpressionScope,
  type ExpressionType,
  type ExpressionTypeKind,
  type FunctionExpressionNode,
  type JsxExpressionNode,
  type NodeCategory,
  type NodeEffect,
  type ScopeKind,
  type SourceSpan,
  type Variable,
  type WalkOptions
} from "./model.js";
export { NodeQuery, NodeRef } from "./query.js";
export {
  buildControlFlowGraph,
  type ControlFlowGraph,
  type ControlFlowNode
} from "./control-flow.js";
export {
  ExpressionModule,
  createModule,
  type BoundModule,
  type ModuleState,
  type SourceTrivia,
  type UnboundModule
} from "./module.js";
export {
  ExpressionProject,
  ExpressionProjectError,
  createExpressionProject,
  findExpressionConfig,
  type ExpressionProjectOptions
} from "./project.js";
export {
  BlockBuilder,
  ClassBuilder,
  FunctionBuilder,
  ModuleBuilder,
  TypeBuilder,
  moduleBuilder,
  printNode,
  type FunctionOptions,
  type MethodOptions,
  type PropertyOptions
} from "./builder.js";
export {
  ModuleRewriter,
  cloneWithVariables,
  lowerModuleText,
  rewriteModule,
  type TextLowerer,
  type TextLoweringContext
} from "./rewrite.js";
export { validateExpressionTree } from "./validation.js";

import { moduleBuilder } from "./builder.js";
import { createExpressionProject } from "./project.js";

/** Concise namespace-style entry point for programmatic construction. */
export const expressions = Object.freeze({
  module: moduleBuilder,
  project: createExpressionProject
});

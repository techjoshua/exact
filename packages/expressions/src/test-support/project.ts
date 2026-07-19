import { onTestFinished } from "vitest";
import {
  createExpressionProject as createOwnedExpressionProject,
  type ExpressionProject,
  type ExpressionProjectOptions
} from "../project.js";

/**
 * Creates a project owned by the current test and disposes it immediately after
 * that test finishes, preventing TypeScript programs from accumulating in a worker.
 */
export function createExpressionProject(options: ExpressionProjectOptions = {}): ExpressionProject {
  const project = createOwnedExpressionProject(options);
  onTestFinished(() => project.dispose());
  return project;
}

import { moduleBuilder } from './builder.js';
import { createExpressionProject } from './project.js';

/** Concise namespace-style entry point for programmatic construction. */
export const expressions = Object.freeze({
	module: moduleBuilder,
	project: createExpressionProject
});

import * as serverTaskHelpers from '@exactjs/core/framework/server-task-helpers';
import * as clientTaskHelpers from '@exactjs/core/runtime/tasks';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { transform } from './index.js';

it.each(['server', 'client'] as const)(
	'resolves emitted indexed task helpers in the %s facade',
	(target) => {
		const output = transform(
			`
import { TaskContext, type Component } from '@exactjs/core';
export function Workspace(this: Component<{draft: string; revision: number}>) {
 this.state.draft = '';
 this.state.revision = 0;
 function save(value: string, task: TaskContext = TaskContext.server()) { return value; }
 const refresh = async (revision: number, draft = this.state.draft) => {
  if (revision) this.state.draft = await save(draft);
 };
 void refresh(this.state.revision);
 return () => <section><input value:onInput={this.state.draft} /><button onClick={() => this.state.revision++}>Save</button></section>;
}`,
			{
				filename: 'TaskFacade.tsx',
				target,
				serverComponents: true,
				componentContractProjection: 'hydrate'
			}
		);
		const source = ts.createSourceFile('output.ts', output, ts.ScriptTarget.Latest, true);
		const facade =
			target === 'server'
				? '@exactjs/core/framework/server-task-helpers'
				: '@exactjs/core/runtime/tasks';
		const imported: string[] = [];
		for (const statement of source.statements) {
			if (
				!ts.isImportDeclaration(statement) ||
				!ts.isStringLiteral(statement.moduleSpecifier) ||
				statement.moduleSpecifier.text !== facade
			)
				continue;
			const bindings = statement.importClause?.namedBindings;
			if (bindings && ts.isNamedImports(bindings))
				for (const binding of bindings.elements)
					imported.push((binding.propertyName ?? binding.name).text);
		}
		expect(imported.length).toBeGreaterThan(0);
		if (target === 'client') expect(imported).toContain('createIndexedContinuationDependency');
		const exports = target === 'server' ? serverTaskHelpers : clientTaskHelpers;
		// Indexed dependencies are part of both facades even when this server projection uses frames.
		expect(exports.createIndexedContinuationDependency).toBeTypeOf('function');
		for (const name of imported)
			expect(exports, `${facade} must export ${name}`).toHaveProperty(name);
	}
);

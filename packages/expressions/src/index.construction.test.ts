import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
	cloneWithVariables,
	expressions,
	lowerModuleText,
	rewriteModule,
	validateExpressionTree
} from './index.js';
import { createExpressionProject } from './test-support/project.js';

const root = path.resolve(import.meta.dirname, '../../..');
const kanbanConfig = path.join(root, 'apps/kanban/tsconfig.json');

describe('@exact/expressions: construction', () => {
	it('constructs, emits, and binds typed modules programmatically', async () => {
		const builder = expressions.module(
			path.join(root, 'apps/kanban/src/__generated_expression.ts')
		);
		const number = builder.types.number();
		builder.exportFunction('double', (fn) => {
			const input = fn.parameter('input', number);
			fn.returns(builder.multiply(builder.reference(input), builder.literal(2)));
		});
		const unbound = builder.build();

		expect(unbound.state).toBe('unbound');
		expect(unbound.emit().code).toContain('export function double(input: number)');

		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const bound = await project.bind(unbound);
		expect(bound.state).toBe('bound');
		expect(bound.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
		expect(bound.walk().functions().single().node.name).toBe('double');
	});

	it('constructs type-only aliased imports as canonical variables', () => {
		const builder = expressions.module('generated-import.ts');
		const [component] = builder.import(['Component'], '@exact/core', {
			typeOnly: true,
			aliases: { Component: 'ExactComponent' }
		});
		expect(component?.name).toBe('ExactComponent');
		expect(component?.importedFrom).toBe('@exact/core');
		expect(component?.typeOnly).toBe(true);
		expect(builder.build().emit().code).toContain(
			'import type { Component as ExactComponent } from "@exact/core";'
		);
	});

	it('constructs classes, generics, async code, closures, objects, arrays, and JSX', async () => {
		const filename = path.join(root, 'apps/kanban/src/__generated_rich_expression.tsx');
		const builder = expressions.module(filename);
		const number = builder.types.number();
		const genericT = builder.types.named('T');
		const promise = builder.ambient('Promise', builder.types.named('PromiseConstructor'));

		builder.exportClass('Counter', (value) => {
			value.property('count', number, builder.literal(0));
			value.method(
				'increment',
				(method) => {
					method.expression(
						builder.assignment(
							builder.member(builder.thisValue(), 'count'),
							builder.literal(1),
							'+='
						)
					);
					method.returns(builder.member(builder.thisValue(), 'count'));
				},
				{ returnType: number }
			);
		});
		builder.function(
			'resolveValue',
			(fn) => {
				const input = fn.parameter('input', genericT);
				const factor = fn.variable('factor', builder.literal(2), number);
				const multiply = fn.arrow(
					(inner) => {
						const value = inner.parameter('value', number);
						return builder.multiply(builder.reference(value), builder.reference(factor));
					},
					{ returnType: number }
				);
				fn.variable('multiply', multiply);
				fn.expression(
					builder.object({ values: builder.array(builder.literal(1), builder.literal(2)) })
				);
				fn.returns(
					builder.await(
						builder.call(
							builder.member(builder.reference(promise), 'resolve'),
							builder.reference(input)
						)
					)
				);
			},
			{
				exported: true,
				async: true,
				typeParameters: ['T'],
				returnType: builder.types.generic('Promise', genericT)
			}
		);
		builder.exportFunction('View', (fn) => {
			const label = fn.parameter('label', builder.types.string());
			fn.returns(
				builder.jsx(
					'section',
					{ class: 'counter' },
					builder.jsx('span', {}, builder.reference(label))
				)
			);
		});

		const unbound = builder.build();
		expect(unbound.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
		expect(unbound.emit().code).toContain('export class Counter');
		expect(unbound.emit().code).toContain('export async function resolveValue<T>');
		expect(unbound.emit().code).toContain('<section class="counter">');

		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const bound = await project.bind(unbound);
		expect(bound.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
		const multiplyArrow = bound
			.walk()
			.functions()
			.where((ref) => ref.node.kind === 'ArrowFunction')
			.single();
		expect(bound.capturesOf(multiplyArrow).map((variable) => variable.name)).toContain('factor');
		expect(multiplyArrow.node.captures.map((variable) => variable.name)).toContain('factor');
	});
});

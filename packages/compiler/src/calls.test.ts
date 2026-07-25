import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { isThisTaskCall, taskCallFacets, taskRequestedPlacement } from './calls.js';

describe('component task call facets', () => {
	it('normalizes composed placement, scheduling, and readiness facets', () => {
		const call = taskCall('this.task.server.deferred.blocking(() => undefined)');

		expect(isThisTaskCall(call)).toBe(true);
		expect(taskRequestedPlacement(call)).toBe('server');
		expect(taskCallFacets(call)).toEqual({
			names: ['server', 'deferred', 'blocking'],
			placement: 'server',
			priority: 'deferred',
			readiness: 'blocking',
			diagnostics: []
		});
	});

	it('reports repeated, contradictory, and unsupported facets', () => {
		expect(
			taskCallFacets(taskCall('this.task.client.server.deferred.deferred.unknown(() => undefined)'))
				?.diagnostics
		).toEqual([
			'error: this.task.client.server.deferred.deferred.unknown() requests both client and server placement',
			'error: this.task.client.server.deferred.deferred.unknown() repeats the deferred facet',
			'error: unsupported this.task() facet unknown'
		]);
	});
});

function taskCall(source: string): ts.CallExpression {
	const file = ts.createSourceFile(
		'task.ts',
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS
	);
	const statement = file.statements[0];
	if (
		!statement ||
		!ts.isExpressionStatement(statement) ||
		!ts.isCallExpression(statement.expression)
	)
		throw new Error('Expected task call expression');
	return statement.expression;
}

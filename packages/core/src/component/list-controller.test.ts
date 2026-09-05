import { createEffectScope, withEffectScope } from '@exactjs/reactive/framework/runtime';
import { describe, expect, it } from 'vitest';
import { readCompiledKeyedChildReceipt } from '../component-abi/keyed-child-receipt.js';
import { createComponentListController } from './list-controller.js';

describe('component list controller', () => {
	it('isolates a nested authored map site beneath each outer keyed item', () => {
		const scope = createEffectScope();
		const controller = createComponentListController(scope);
		const output = controller.map(
			[
				{ id: 'exact', values: ['mean', 'p50'] },
				{ id: 'react', values: ['mean', 'p50'] }
			],
			(item) => item.id,
			(item) => () =>
				controller.map(
					item.values,
					(value) => value,
					(value) => `${item.id}:${value}`,
					'inner',
					undefined,
					undefined,
					true
				),
			'outer',
			undefined,
			'member:id',
			true
		) as readonly object[];

		expect(output.map(readNestedValues)).toEqual([
			['exact:mean', 'exact:p50'],
			['react:mean', 'react:p50']
		]);
		controller.dispose();
		scope.stop();
	});
});

function readNestedValues(receipt: object): readonly unknown[] {
	const outer = readCompiledKeyedChildReceipt(receipt)!;
	const nested = withEffectScope(outer.ownerScope, outer.value as () => readonly object[]);
	return nested.map((value) => readCompiledKeyedChildReceipt(value)?.value);
}

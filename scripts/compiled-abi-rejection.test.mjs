import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isPreservedAbiRejection } from './compiled-abi-rejection.mjs';

for (const version of ['0.5.0', '0.6.0']) {
	for (const target of ['client', 'server']) {
		test(`matches only the frozen ${version} ${target} removed-helper boundary`, async () => {
			const source = await readFile(`fixtures/release-abi/${version}/${target}.js`, 'utf8');
			const symbol =
				target === 'client'
					? 'createCompiledComponentReceipt'
					: 'createPreparedServerComponentReference';
			const provider =
				target === 'client' ? 'runtime/component-operations' : 'framework/server-render-structure';
			const lines = source.split('\n');
			const line = lines.findIndex((text) => text.startsWith(`import { ${symbol} `));
			assert.ok(line >= 0);
			const error = {
				errors: [
					{
						id: '',
						pluginName: '',
						notes: [],
						text: `No matching export in "packages/core/dist/${target}/${provider}.js" for import "${symbol}"`,
						location: {
							file: `fixtures/release-abi/${version}/${target}.js`,
							line: line + 1,
							column: lines[line].indexOf(symbol),
							length: symbol.length,
							lineText: lines[line]
						}
					}
				]
			};
			const context = { version, target, source };
			assert.equal(isPreservedAbiRejection(error, context), true);
			for (const change of [
				{ text: error.errors[0].text.replace(symbol, 'unrelatedExport') },
				{ text: 'Could not resolve "missing-package"' },
				{ text: error.errors[0].text.replace('packages/core/', 'packages/dom/') },
				{ pluginName: 'authored-plugin' },
				{ location: { ...error.errors[0].location, file: 'unrelated.js' } },
				{ location: { ...error.errors[0].location, lineText: 'different source' } }
			]) {
				assert.equal(
					isPreservedAbiRejection({ errors: [{ ...error.errors[0], ...change }] }, context),
					false
				);
			}
			assert.equal(
				isPreservedAbiRejection({ errors: [...error.errors, ...error.errors] }, context),
				false
			);
			assert.equal(isPreservedAbiRejection(new Error('unrelated failure'), context), false);
			assert.equal(
				isPreservedAbiRejection(new Error('Unsupported eXact component contract 4'), context),
				true
			);
			assert.equal(isPreservedAbiRejection(error, { ...context, version: '0.7.0' }), false);
		});
	}
}

test('separates runtime ABI errors from malformed present diagnostic containers', () => {
	const context = { version: '0.5.0', target: 'client', source: '' };
	const message = 'Unsupported eXact component contract 4';
	assert.equal(isPreservedAbiRejection(new Error(message), context), true);
	assert.equal(isPreservedAbiRejection(new TypeError(message), context), true);
	for (const errors of [undefined, null, {}, 'malformed']) {
		assert.equal(isPreservedAbiRejection({ errors, message }, context), false);
		assert.equal(
			isPreservedAbiRejection(Object.assign(new Error(message), { errors }), context),
			false
		);
	}
	const inherited = Object.assign(Object.create({ errors: {} }), { message });
	assert.equal(isPreservedAbiRejection(inherited, context), false);
});

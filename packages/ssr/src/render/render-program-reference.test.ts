import {
	createPreparedServerRenderProgram,
	prepareCompiledRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import { expect, it } from 'vitest';
import { createSsrContext } from './context.js';
import { renderPreparedSsrProgram } from './render-program.js';
import { consumeScalarPropsProof } from './scalar-props-proof.js';
import {
	readServerComponentReference,
	type ServerComponentReference
} from './server-component-reference.js';
import { StaticServerLeaf } from './static-server-programs.fixtures.test.js';

function referenceIssuer(props: Record<string, unknown>, field: string | undefined = 'title') {
	let reference: ServerComponentReference | undefined;
	const invocation = createPreparedServerRenderProgram(
		prepareCompiledRenderProgram({
			version: 2,
			id: 'reference-ownership',
			namespace: 'html',
			ssr(operations, _context, current, output) {
				reference = readServerComponentReference(
					operations.reference(StaticServerLeaf, props, field, current)
				);
				return output;
			}
		}),
		[]
	);
	return async () => {
		await renderPreparedSsrProgram(createSsrContext({}), invocation, () => '');
		if (!reference) throw new Error('Expected an issued server reference');
		return reference;
	};
}

it.each([false, true])(
	'normalizes newly exposed metadata after a first scalar=%s attempt',
	async (scalar) => {
		const props: Record<string, unknown> = { title: scalar ? 'ready' : {} };
		const issue = referenceIssuer(props);
		const first = await issue();
		expect(first.props).toBe(props);
		expect(consumeScalarPropsProof(first, props)).toBe(scalar);
		props.key = 'later';
		const repeated = await issue();
		expect(repeated.key).toBe('later');
		expect(repeated.props).not.toBe(props);
		expect(Object.hasOwn(repeated.props, 'key')).toBe(false);
		expect(consumeScalarPropsProof(repeated, repeated.props)).toBe(false);
	}
);

it('retains inherited metadata normalization before a first proof attempt', async () => {
	const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'key');
	try {
		Object.defineProperty(Object.prototype, 'key', {
			value: 'inherited',
			writable: true,
			configurable: true
		});
		const props = { title: 'ready' };
		const reference = await referenceIssuer(props)();
		expect(reference.key).toBe('inherited');
		expect(consumeScalarPropsProof(reference, props)).toBe(false);
	} finally {
		if (previous) Object.defineProperty(Object.prototype, 'key', previous);
		else Reflect.deleteProperty(Object.prototype, 'key');
	}
});

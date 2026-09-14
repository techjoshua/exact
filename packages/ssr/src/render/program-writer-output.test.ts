import { expect, it } from 'vitest';
import { createSsrContext } from './context.js';
import { renderProgramWriter } from './program-writer-output.js';

it.each(['success', 'throw', 'reject'] as const)(
	'keeps target receivers and per-invocation preparation isolated on %s',
	async (outcome) => {
		const disposed: string[] = [];
		const failure = new Error('target child failed');
		const target = {
			prefix: 'child:',
			renderProgramSegment(value: string) {
				expect(this).toBe(target);
				if (outcome === 'throw') throw failure;
				if (outcome === 'reject') return Promise.reject(failure);
				return Promise.resolve(this.prefix + value);
			},
			prepareProgramReferences(values: readonly string[]) {
				expect(this).toBe(target);
				return {
					async [Symbol.asyncDispose]() {
						disposed.push(values[0]!);
					}
				};
			}
		};
		const run = (value: string) =>
			renderProgramWriter<string>(
				createSsrContext({ markers: false }),
				undefined,
				undefined,
				async (output) => {
					output.preparation = output.prepareReferences!([value]);
					output.sink.write(await output.render(value));
					return output;
				},
				target
			);
		const results = await Promise.allSettled([run('left'), run('right')]);
		if (outcome === 'success')
			expect(results).toEqual([
				{ status: 'fulfilled', value: 'child:left' },
				{ status: 'fulfilled', value: 'child:right' }
			]);
		else
			expect(results).toEqual([
				{ status: 'rejected', reason: failure },
				{ status: 'rejected', reason: failure }
			]);
		expect(disposed.sort()).toEqual(['left', 'right']);
	}
);

it.each([false, true])(
	'preserves output and releases prepared siblings with shared=%s',
	async (shared) => {
		const context = createSsrContext({ markers: false });
		let published = '';
		let disposed = 0;
		if (shared)
			context.writerSink = {
				write(html) {
					published += html;
				},
				ready() {},
				flush() {}
			};
		const result = await renderProgramWriter<string>(
			context,
			undefined,
			undefined,
			async (output) => {
				output.preparation = output.prepareReferences?.(['child']);
				output.sink.write('before');
				output.sink.write(await output.render('child'));
				output.sink.write('after');
				return output;
			},
			(value) => value,
			() => ({
				async [Symbol.asyncDispose]() {
					disposed++;
				}
			})
		);
		expect(published + result).toBe('beforechildafter');
		expect(disposed).toBe(1);
	}
);

it.each(['throw', 'reject', 'invalid'] as const)(
	'releases preparation after writer %s',
	async (failure) => {
		const context = createSsrContext({ markers: false });
		let disposed = 0;
		const error = new Error('writer failed');
		const result = renderProgramWriter(
			context,
			undefined,
			undefined,
			(output) => {
				output.preparation = {
					async [Symbol.asyncDispose]() {
						disposed++;
					}
				};
				if (failure === 'throw') throw error;
				if (failure === 'reject') return Promise.reject(error);
				return undefined;
			},
			() => ''
		);
		await expect(result).rejects.toThrow(
			failure === 'invalid' ? 'caller-owned output' : 'writer failed'
		);
		expect(disposed).toBe(1);
	}
);

it('retains document ancestry while head publication is backpressured', async () => {
	const context = createSsrContext({ markers: false });
	let release!: () => void;
	const pressure = new Promise<void>((resolve) => {
		release = resolve;
	});
	let published = '';
	context.writerSink = {
		write(html) {
			published += html;
		},
		ready() {},
		flush() {
			return pressure;
		}
	};
	const result = renderProgramWriter(
		context,
		'html',
		undefined,
		async (outer) => {
			outer.sink.write('<html>');
			await renderProgramWriter(
				context,
				'head',
				undefined,
				(head) => {
					head.sink.write('<head><title>Ready</title></head>');
					return head;
				},
				() => ''
			);
			outer.sink.write('<body></body></html>');
			return outer;
		},
		() => ''
	);
	expect(published).toBe('<!doctype html><html><head><title>Ready</title></head>');
	expect(context.hostStack).toEqual(['html', 'head']);
	release();
	expect(await result).toBe('');
	expect(context.hostStack).toEqual([]);
});

it('keeps captured enhancement prefixes local', async () => {
	const context = createSsrContext({ markers: false });
	const route = {
		identity: 'route',
		props: {},
		componentDepth: 0,
		consumed: false,
		nested: false,
		nestedBefore: undefined as string | undefined
	};
	context.enhancementOperationRoutes = [route];
	const result = await renderProgramWriter(
		context,
		undefined,
		undefined,
		(output) => {
			output.sink.write('before');
			route.nested = true;
			output.sink.write('target');
			return output;
		},
		() => ''
	);
	expect(route.nestedBefore).toBe('before');
	expect(result).toBe('target');
});

it.each(['ready', 'writer', 'flush'] as const)(
	'unwinds document ancestry when %s fails synchronously or asynchronously',
	async (phase) => {
		for (const pending of [false, true]) {
			const context = createSsrContext({ markers: false });
			context.documentRootSeen = true;
			context.hostStack.push('html');
			const error = new Error('publication failed');
			const fail = () => {
				if (pending) return Promise.reject(error);
				throw error;
			};
			let invocations = 0;
			context.writerSink = {
				write() {},
				ready() {
					if (phase === 'ready') return fail();
				},
				flush() {
					if (phase === 'flush') return fail();
				}
			};
			await expect(
				Promise.resolve().then(() =>
					renderProgramWriter(
						context,
						'head',
						undefined,
						(output) => {
							invocations++;
							return phase === 'writer' ? fail() : output;
						},
						() => ''
					)
				)
			).rejects.toBe(error);
			expect(context.hostStack).toEqual(['html']);
			expect(invocations).toBe(phase === 'ready' ? 0 : 1);
		}
	}
);

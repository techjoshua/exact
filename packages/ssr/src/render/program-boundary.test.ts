import { expect, it } from 'vitest';
import { createSsrContext } from './context.js';
import { mapRenderValue } from './execution.js';
import { writeProgramChild } from './program-boundary.js';
import { renderProgramWriter } from './program-writer-output.js';

it.each([false, true])('publishes marked and unmarked children with shared=%s', async (shared) => {
	for (const markers of [false, true])
		for (const markerless of [false, true]) {
			const context = createSsrContext({ markers });
			let published = '';
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
				(output) =>
					mapRenderValue(
						writeProgramChild(context, output, 'child', 'row', 10, markerless),
						(characters) => {
							expect(characters).toBe(
								10 + (markers && !markerless ? '<!--x:row--><!--/x:row-->'.length : 0)
							);
							return output;
						}
					),
				(value) => {
					if (context.writerSink) {
						context.writerSink.write(value);
						return '';
					}
					return value;
				}
			);
			expect(published + result).toBe(
				markers && !markerless ? '<!--x:row-->child<!--/x:row-->' : 'child'
			);
		}
});

it('rejects the marker budget before starting child work', () => {
	const context = createSsrContext({ markers: true, maxOutputBytes: 1 });
	let started = false;
	expect(() =>
		renderProgramWriter(
			context,
			undefined,
			undefined,
			(output) => mapRenderValue(writeProgramChild(context, output, {}, 'row', 0), () => output),
			() => {
				started = true;
				return '';
			}
		)
	).toThrow(/maximum of 1 bytes/);
	expect(started).toBe(false);
});

it('retains prepared siblings until a pending child settles after a failed flush', async () => {
	const context = createSsrContext({ markers: true });
	const failure = new Error('failed flush');
	let settle!: () => void;
	let settled = false;
	let disposed = 0;
	const child = new Promise<string>((resolve) => {
		settle = () => {
			settled = true;
			resolve('late');
		};
	});
	context.writerSink = {
		write() {},
		ready() {},
		flush() {
			throw failure;
		}
	};
	const result = renderProgramWriter(
		context,
		undefined,
		undefined,
		(output) => {
			output.preparation = {
				async [Symbol.asyncDispose]() {
					expect(settled).toBe(true);
					disposed++;
				}
			};
			return mapRenderValue(writeProgramChild(context, output, {}, 'row', 0), () => output);
		},
		() => child
	);
	expect(disposed).toBe(0);
	settle();
	await expect(result).rejects.toBe(failure);
	expect(disposed).toBe(1);
});

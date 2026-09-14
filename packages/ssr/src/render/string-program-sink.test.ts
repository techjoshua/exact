import { expect, it } from 'vitest';
import { SsrOutputLimitError } from './limits.js';
import { StringProgramSink } from './string-program-sink.js';

it.each([
	{ parts: ['ab', 'cd'], prefix: [], bytes: 4 },
	{ parts: ['日', '本'], prefix: ['語'], bytes: 9 },
	{ parts: ['\ud83d', '\ude80'], prefix: [], bytes: 4 },
	{ parts: ['\ud83d'], prefix: [], bytes: 3 },
	{ parts: ['\ude80'], prefix: ['\ud83d'], bytes: 4 },
	{ parts: ['é'], prefix: ['a', 'b'], bytes: 4 }
])('checks the final UTF-8 boundary for $parts with prefix $prefix', ({ parts, prefix, bytes }) => {
	for (const maxBytes of [bytes - 1, bytes, bytes + 1]) {
		const sink = new StringProgramSink(maxBytes);
		const render = () => {
			for (const part of parts) sink.write(part);
			return sink.finish(prefix);
		};
		if (maxBytes < bytes) expect(render).toThrow(SsrOutputLimitError);
		else expect(render()).toBe(prefix.join('') + parts.join(''));
		expect(() => sink.write('later')).toThrow(/closed/);
	}
});

it('releases unfinished output when its owner cancels', () => {
	const sink = new StringProgramSink(100);
	sink.write('unfinished');
	sink.destroy();
	sink.destroy();
	expect(() => sink.finish()).toThrow(/closed/);
});

it('returns completed text without allowing owner cleanup to erase the result', () => {
	const sink = new StringProgramSink(100);
	sink.write('body');
	const html = sink.finish(['head']);
	sink.destroy();
	expect(html).toBe('headbody');
	expect(() => sink.write('later')).toThrow(/closed/);
});

it('preserves all text until completion across publication boundaries', () => {
	const sink = new StringProgramSink(100);
	for (const part of ['ab', 'cdefghijkl', '\ud83d', '\ude80', '', 'tail']) sink.write(part);
	sink.flush();
	sink.ready();
	expect(sink.finish()).toBe('abcdefghijkl🚀tail');
});

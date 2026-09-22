import { expect, it } from 'vitest';
import { createResponseEncoder } from './encoding.js';

it.each(['portable', 'native'] as const)('preserves split UTF-8 spans with %s encoding', (host) => {
	const portable = new TextEncoder();
	const encode = host === 'native' ? Buffer.from : portable.encode.bind(portable);
	const encoder = createResponseEncoder(encode);
	const chunks = ['plain café ', '\ud83d', '', '\ude80 日本 ', '\ud800'];
	const result = Buffer.concat([...chunks.map((chunk) => encoder.encode(chunk)), encoder.finish()]);
	expect([...result]).toEqual([...portable.encode(chunks.join(''))]);
});

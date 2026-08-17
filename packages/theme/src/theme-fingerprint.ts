import type { ResolvedThemeSource } from './contracts.js';
import { decimal } from './color.js';

/** Produces the deterministic contract fingerprint for a resolved source. */
export function fingerprintThemeSource(source: ResolvedThemeSource): string {
	return sha256Base64Url(canonicalJson(sourceForFingerprint(source)));
}

function sourceForFingerprint(source: ResolvedThemeSource): unknown {
	return {
		...source,
		keyColor: source.keyColor.css,
		neutralColor: source.neutralColor === 'auto' ? 'auto' : source.neutralColor.css,
		canvasColor: source.canvasColor === 'auto' ? 'auto' : source.canvasColor.css
	};
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== 'object')
		return typeof value === 'number' ? decimal(value, 8) : JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	return `{${Object.keys(value)
		.sort()
		.map(
			(key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
		)
		.join(',')}}`;
}

function sha256Base64Url(text: string): string {
	const bytes = new TextEncoder().encode(text),
		words: number[] = [],
		bitLength = bytes.length * 8;
	for (const byte of bytes) words.push(byte);
	words.push(0x80);
	while (words.length % 64 !== 56) words.push(0);
	for (let index = 7; index >= 0; index--)
		words.push(Math.floor(bitLength / 2 ** (index * 8)) & 255);
	const h = [
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
	];
	const k = [
		0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
		0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
		0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
		0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
		0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
		0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
		0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
		0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
	];
	const rotate = (value: number, count: number) => (value >>> count) | (value << (32 - count));
	for (let offset = 0; offset < words.length; offset += 64) {
		const w = new Array<number>(64);
		for (let index = 0; index < 16; index++)
			w[index] =
				(words[offset + index * 4]! << 24) |
				(words[offset + index * 4 + 1]! << 16) |
				(words[offset + index * 4 + 2]! << 8) |
				words[offset + index * 4 + 3]!;
		for (let index = 16; index < 64; index++) {
			const a = w[index - 15]!,
				b = w[index - 2]!,
				s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3),
				s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
			w[index] = (w[index - 16]! + s0 + w[index - 7]! + s1) | 0;
		}
		let [a, b, c, d, e, f, g, q] = h;
		for (let index = 0; index < 64; index++) {
			const s1 = rotate(e!, 6) ^ rotate(e!, 11) ^ rotate(e!, 25),
				ch = (e! & f!) ^ (~e! & g!),
				t1 = (q! + s1 + ch + k[index]! + w[index]!) | 0,
				s0 = rotate(a!, 2) ^ rotate(a!, 13) ^ rotate(a!, 22),
				maj = (a! & b!) ^ (a! & c!) ^ (b! & c!),
				t2 = (s0 + maj) | 0;
			q = g;
			g = f;
			f = e;
			e = (d! + t1) | 0;
			d = c;
			c = b;
			b = a;
			a = (t1 + t2) | 0;
		}
		const values = [a, b, c, d, e, f, g, q];
		for (let index = 0; index < 8; index++) h[index] = (h[index]! + values[index]!) | 0;
	}
	const digest = new Uint8Array(32);
	h.forEach((word, index) => {
		digest[index * 4] = word >>> 24;
		digest[index * 4 + 1] = word >>> 16;
		digest[index * 4 + 2] = word >>> 8;
		digest[index * 4 + 3] = word;
	});
	let binary = '';
	for (const byte of digest) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').toLowerCase();
}

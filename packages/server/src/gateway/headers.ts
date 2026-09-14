import type { ExactRequestLike } from '../types.js';

const hopByHop = [
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade'
];

/** Removes transport-owned headers, including headers nominated by Connection. Credentials remain intact. */
export function gatewayHeaders(source: ExactRequestLike['headers']): Headers {
	const result = new Headers();
	if (source instanceof Headers) source.forEach((value, name) => result.append(name, value));
	else if (source)
		for (const [name, value] of Object.entries(source)) {
			if (Array.isArray(value)) for (const part of value) result.append(name, part);
			else if (value !== undefined) result.set(name, value);
		}
	for (const name of result.get('connection')?.split(',') ?? []) result.delete(name.trim());
	for (const name of hopByHop) result.delete(name);
	result.delete('content-length');
	return result;
}

import { profileNodeAllocations, profileNodeCpu } from './ssr-allocation-profiler.mjs';

/** Runs renderer-only timing and Node allocation diagnostics without service or socket work. */
export async function renderOnlyDiagnostic(participant, url) {
	if (!participant.renderOnly)
		return { supported: false, reason: 'participant-renderer-not-exposed' };
	const iterations = boundedInteger(url.searchParams.get('iterations'), 1, 10_000, 1_000);
	const profileIterations = boundedInteger(
		url.searchParams.get('profileIterations'),
		1,
		1_000,
		100
	);
	const cpuIterations = boundedInteger(url.searchParams.get('cpuIterations'), 1, 10_000, 1_000);
	await participant.renderOnly(Math.min(iterations, 100));
	const timing = await participant.renderOnly(iterations);
	const cpu = await profileNodeCpu(() => participant.renderOnly(cpuIterations));
	const allocation = await profileNodeAllocations(() => participant.renderOnly(profileIterations));
	return {
		supported: true,
		iterations,
		cpuIterations,
		profileIterations,
		timing,
		cpu,
		allocation
	};
}

/** Reads an optional response-size control used only by the equal-payload attribution lane. */
export function benchmarkPayloadTarget(url) {
	const value = url.searchParams.get('__benchmarkPayloadBytes');
	if (value === null) return undefined;
	return boundedInteger(value, 1, 1_000_000);
}

/** Returns the byte count named by one transport-only payload route. */
export function payloadRouteBytes(pathname) {
	const match = pathname.match(/^\/__exact-benchmark\/payload\/(\d+)$/);
	return match ? boundedInteger(match[1], 1, 1_000_000) : undefined;
}

/** Pads a Node response body to the requested diagnostic size without inspecting framework markup. */
export function equalizeNodeResponsePayload(request, response) {
	const target = benchmarkPayloadTarget(new URL(request.url ?? '/', 'http://localhost'));
	if (target === undefined) return;
	let bytes = 0;
	const setHeader = response.setHeader;
	const writeHead = response.writeHead;
	const write = response.write;
	const end = response.end;
	response.setHeader = function (name, value) {
		return setHeader.call(
			this,
			name,
			String(name).toLowerCase() === 'content-length' ? target : value
		);
	};
	response.writeHead = function (...arguments_) {
		const headers =
			typeof arguments_[1] === 'object' && arguments_[1] !== null ? arguments_[1] : arguments_[2];
		rewriteContentLength(headers, target);
		return writeHead.apply(this, arguments_);
	};
	response.write = function (chunk, encoding, callback) {
		bytes += bodyByteLength(chunk, encoding);
		return write.call(this, chunk, encoding, callback);
	};
	response.end = function (chunk, encoding, callback) {
		if (typeof chunk === 'function') {
			callback = chunk;
			chunk = undefined;
			encoding = undefined;
		} else if (typeof encoding === 'function') {
			callback = encoding;
			encoding = undefined;
		}
		if (chunk !== undefined) {
			bytes += bodyByteLength(chunk, encoding);
			write.call(this, chunk, encoding);
		}
		const missing = target - bytes;
		if (missing > 0) write.call(this, ' '.repeat(missing));
		return end.call(this, callback);
	};
}

/** Rebuilds an immutable Fetch response with trailing padding for the equal-payload lane. */
export async function equalizeFetchResponsePayload(response, target) {
	if (target === undefined) return response;
	const body = new Uint8Array(await response.arrayBuffer());
	if (body.byteLength >= target) return new Response(body, response);
	const padded = new Uint8Array(target);
	padded.set(body);
	padded.fill(32, body.byteLength);
	return new Response(padded, response);
}

function boundedInteger(value, minimum, maximum, fallback) {
	if (value === null && fallback !== undefined) return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
		throw new TypeError(
			`Expected an integer from ${minimum} through ${maximum}, received ${value}`
		);
	return parsed;
}

function bodyByteLength(chunk, encoding) {
	return typeof chunk === 'string'
		? Buffer.byteLength(chunk, typeof encoding === 'string' ? encoding : undefined)
		: chunk.byteLength;
}

function rewriteContentLength(headers, target) {
	if (Array.isArray(headers)) {
		for (let index = 0; index < headers.length; index += 2)
			if (String(headers[index]).toLowerCase() === 'content-length') headers[index + 1] = target;
		return;
	}
	if (!headers) return;
	for (const name of Object.keys(headers))
		if (name.toLowerCase() === 'content-length') headers[name] = target;
}

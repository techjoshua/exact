import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decodeReactiveProtocolValue } from '../../packages/core/dist/index.js';
import { compileFileArtifacts, createCompilerSession } from '../../packages/compiler/dist/index.js';
import { isJsonSafe, parseExactRequestBody } from '../../packages/server/dist/protocol.js';
import { elapsed, elapsedAsync, payloadBytes, repeat } from './foundation-measurement.mjs';

let buildHostState;

/** Compares the former duplicate decoded validation with the fused request parser. */
export function measureTransport() {
	const iterations = 2_000;
	const encodedRequest = JSON.stringify({
		type: 'invoke',
		id: 'save-parcel',
		payload: {
			label: 'International parcel',
			values: Array.from({ length: 64 }, (_, index) => index),
			metadata: Object.fromEntries(
				Array.from({ length: 24 }, (_, index) => [`field${index}`, `value-${index}`])
			)
		}
	});
	const parse = elapsed(() => repeat(iterations, () => JSON.parse(encodedRequest)));
	const encoded = JSON.parse(encodedRequest);
	const encodedValidation = elapsed(() =>
		repeat(iterations, () => isJsonSafe(encoded, { maxBytes: 4 * 1024 * 1024 }))
	);
	const decode = elapsed(() => repeat(iterations, () => decodeReactiveProtocolValue(encoded)));
	const decoded = decodeReactiveProtocolValue(encoded);
	const payloadValidation = elapsed(() =>
		repeat(iterations, () => legacyDecodedPayloadSafe(decoded, 4 * 1024 * 1024))
	);
	const complete = elapsed(() =>
		repeat(iterations, () => {
			const request = parseExactRequestBody(encodedRequest);
			if (!legacyDecodedPayloadSafe(request, 4 * 1024 * 1024))
				throw new Error('representative request unexpectedly failed decoded validation');
			return request;
		})
	);
	const fused = elapsed(() => repeat(iterations, () => parseExactRequestBody(encodedRequest)));
	const adversarialRequest = deeplyNestedRequest(110);
	let adversarialRejections = 0;
	const adversarial = elapsed(() =>
		repeat(500, () => {
			try {
				parseExactRequestBody(adversarialRequest);
			} catch {
				adversarialRejections++;
			}
		})
	);
	if (adversarialRejections !== 500)
		throw new Error('adversarial request was not rejected at the parser boundary');
	return {
		parseMs: parse.duration,
		encodedValidationMs: encodedValidation.duration,
		decodeMs: decode.duration,
		payloadValidationMs: payloadValidation.duration,
		completeMs: complete.duration,
		fusedMs: fused.duration,
		fusedSpeedup: complete.duration / fused.duration,
		validationShare: (encodedValidation.duration + payloadValidation.duration) / complete.duration,
		adversarialRejectionMs: adversarial.duration,
		...payloadBytes('request', encodedRequest)
	};
}

/** Profiles retained native work separately from JavaScript artifact publication. */
export async function measureBuildHost() {
	const state = await ensureBuildHostState();
	state.profileEvents.length = 0;
	const revision = state.revision++;
	const source = buildHostSource(revision);
	await writeFile(state.input, source, 'utf8');
	const compiled = await elapsedAsync(() =>
		compileFileArtifacts(state.input, {
			outDir: state.output,
			rootDir: state.root,
			session: state.session,
			generatedValidation: 'syntax'
		})
	);
	const nativeMs = state.profileEvents
		.filter((event) => event.phase === 'native-request')
		.reduce((total, event) => total + event.elapsedMs, 0);
	const request = {
		kind: 'compile',
		id: state.input,
		source,
		target: 'client',
		diagnostics: 'syntax'
	};
	const native = await elapsedAsync(() => Promise.resolve(state.session.compileNative(request)));
	const requestEncoding = elapsed(() => JSON.stringify(request));
	const responseJson = JSON.stringify(native.value);
	const responseDecoding = elapsed(() => JSON.parse(responseJson));
	if (!compiled.value.client.code || !compiled.value.server.code)
		throw new Error('build-host profile did not emit paired artifacts');
	return {
		artifactTotalMs: compiled.duration,
		artifactNativeMs: nativeMs,
		artifactHostMs: Math.max(0, compiled.duration - nativeMs),
		nativeRequestMs: native.duration,
		requestEncodingMs: requestEncoding.duration,
		responseDecodingMs: responseDecoding.duration,
		requestBytes: Buffer.byteLength(requestEncoding.value),
		responseBytes: Buffer.byteLength(responseJson)
	};
}

/** Releases the retained compiler process and temporary artifact workspace. */
export async function disposeBuildHost() {
	if (!buildHostState) return;
	buildHostState.session.dispose();
	await rm(buildHostState.root, { recursive: true, force: true });
	buildHostState = undefined;
}

async function ensureBuildHostState() {
	if (buildHostState) return buildHostState;
	const workspace = path.resolve(import.meta.dirname, '..', '..');
	const root = await mkdtemp(path.join(workspace, '.exact-foundation-build-'));
	const input = path.join(root, 'view.tsx');
	const output = path.join(root, 'artifacts');
	const profileEvents = [];
	const session = createCompilerSession({ onProfile: (event) => profileEvents.push(event) });
	buildHostState = { root, input, output, profileEvents, session, revision: 0 };
	return buildHostState;
}

function buildHostSource(revision) {
	return `import type { Component } from '@exactjs/core';
export function BuildHostProbe(this: Component<{ value: number }>, props: { count: number }) {
	this.state.value = ${revision};
	return () => <main><h1>Build host</h1>{Array.from({ length: props.count }, (_, index) => <p>{this.state.value + index}</p>)}</main>;
}`;
}

function deeplyNestedRequest(depth) {
	let payload = 'leaf';
	for (let index = 0; index < depth; index++) payload = { child: payload };
	return JSON.stringify({ type: 'invoke', id: 'adversarial-depth', payload });
}

function legacyDecodedPayloadSafe(input, maxBytes) {
	if (input.type === 'batch')
		return input.operations.every((operation) => legacyDecodedPayloadSafe(operation, maxBytes));
	if (input.type === 'debug') return true;
	const limits = { maxDepth: 100, maxNodes: 100_000, maxBytes };
	return (
		isJsonSafe(input.payload, limits) &&
		isJsonSafe(input.state, limits) &&
		isJsonSafe(input.publicContext, limits)
	);
}

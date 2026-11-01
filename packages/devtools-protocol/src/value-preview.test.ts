import { describe, expect, it } from 'vitest';
import { isExactRuntimeInspectionEvent } from './runtime.js';
import { previewExactValue, redactExactValue } from './value-preview.js';

describe('safe eXact value previews', () => {
	it('does not invoke getters or toJSON and bounds cyclic collections', () => {
		let getterReads = 0;
		const value: Record<string, unknown> = {
			visible: 'ok',
			toJSON() {
				throw new Error('must not run');
			}
		};
		Object.defineProperty(value, 'hidden', {
			enumerable: true,
			get() {
				getterReads++;
				return 'secret';
			}
		});
		value.self = value;

		const preview = previewExactValue(value, { limits: { maxEntries: 3 } });

		expect(getterReads).toBe(0);
		expect(JSON.stringify(preview)).not.toContain('secret');
		expect(JSON.stringify(preview)).toContain('cycle');
	});

	it('redacts a qualified path before touching its value', () => {
		const guarded = new Proxy(
			{},
			{
				ownKeys() {
					throw new Error('redaction must happen first');
				}
			}
		);
		const preview = previewExactValue(
			{ apiKey: guarded },
			{
				redact: (path) => (path.join('.') === 'apiKey' ? 'secret' : undefined)
			}
		);
		expect(preview).toMatchObject({
			kind: 'object',
			entries: [{ key: 'apiKey', value: { kind: 'redacted', reason: 'secret' } }]
		});
	});

	it('stops after hostile proxy failures without retrying through other traps', () => {
		let traps = 0;
		const guarded = new Proxy(
			{},
			{
				getPrototypeOf() {
					traps++;
					throw new Error('blocked');
				},
				ownKeys() {
					traps++;
					throw new Error('must not retry');
				}
			}
		);
		expect(previewExactValue(guarded)).toEqual({
			kind: 'unavailable',
			reason: 'inspection-failed'
		});
		expect(traps).toBe(1);
	});

	it('does not invoke accessors when an object resembles a DOM node', () => {
		let reads = 0;
		const prototype = {};
		Object.defineProperty(prototype, 'nodeType', {
			get() {
				reads++;
				return 1;
			}
		});
		const value = Object.create(prototype);
		Object.defineProperty(value, 'nodeName', {
			get() {
				reads++;
				return 'SCRIPT';
			}
		});
		expect(previewExactValue(value)).toMatchObject({ kind: 'dom', tag: 'element' });
		expect(reads).toBe(0);
	});

	it('bounds UTF-8 preview bytes without splitting surrogate pairs', () => {
		const preview = previewExactValue('😀😀😀😀', { limits: { maxBytes: 8 } });
		expect(preview).toEqual({ kind: 'scalar', value: '😀…' });
		expect(
			new TextEncoder().encode((preview as { value: string }).value).byteLength
		).toBeLessThanOrEqual(8);
	});

	it('captures own Error details without invoking inherited accessors', () => {
		const error = new TypeError('invalid shipment');
		Object.defineProperty(error, 'cause', { value: { code: 'RATE_MISSING' } });

		expect(previewExactValue(error)).toMatchObject({
			kind: 'object',
			type: 'TypeError',
			entries: [
				{ key: 'message', value: { kind: 'scalar', value: 'invalid shipment' } },
				{ key: 'cause', value: { kind: 'object' } }
			]
		});
	});
});

it.each([
	['Map', 'getter'],
	['Map', 'callback'],
	['Set', 'getter'],
	['Set', 'callback']
] as const)('does not invoke an overridden %s iterator (%s)', (kind, mode) => {
	let calls = 0;
	const value = kind === 'Map' ? new Map([['visible', 'ok']]) : new Set(['ok']);
	const callback = () => {
		calls++;
		throw new Error('application iterator must not run');
	};
	Object.defineProperty(
		value,
		Symbol.iterator,
		mode === 'getter' ? { get: callback } : { value: callback }
	);
	const result = previewExactValue(value);
	expect(calls).toBe(0);
	expect(result).toMatchObject({ kind: 'object', type: kind, truncated: false });
	expect(JSON.stringify(result)).toContain('ok');
});

it.each(['constructor', 'name'])('does not invoke a type-label %s accessor', (key) => {
	let calls = 0;
	const constructor = function ApplicationValue() {};
	const prototype = { constructor };
	Object.defineProperty(key === 'constructor' ? prototype : constructor, key, {
		get() {
			calls++;
			throw new Error('application accessor must not run');
		}
	});
	const value = Object.assign(Object.create(prototype), { visible: 'ok' });
	expect(previewExactValue(value)).toMatchObject({
		kind: 'object',
		type: 'Object',
		entries: [{ key: 'visible', value: { kind: 'scalar', value: 'ok' } }]
	});
	expect(calls).toBe(0);
});

it('uses safe type labels at the depth boundary and retains normal inherited names', () => {
	let reads = 0;
	const unsafe = Object.create({
		get constructor() {
			reads++;
			return Object;
		}
	});
	expect(previewExactValue({ unsafe }, { limits: { maxDepth: 1 } })).toMatchObject({
		kind: 'object',
		entries: [{ key: 'unsafe', value: { kind: 'object', type: 'Object', truncated: true } }]
	});
	expect(reads).toBe(0);
	class ApplicationValue {}
	expect(previewExactValue(Object.create(ApplicationValue.prototype))).toMatchObject({
		type: 'ApplicationValue'
	});
	expect(previewExactValue(Object.create(Object.create(ApplicationValue.prototype)))).toMatchObject(
		{ type: 'ApplicationValue' }
	);
	expect(previewExactValue(Object.create(null))).toMatchObject({ type: 'Object' });
});

it.each([undefined, NaN, Infinity, -Infinity, -0])(
	'preserves the constant preview %s over JSON',
	(value) => {
		const preview = previewExactValue(value);
		const event = {
			protocol: 1,
			cursor: '1',
			sequence: 1,
			timestamp: 0,
			kind: 'state.change',
			id: {
				sessionId: 'session',
				side: 'client',
				buildKey: 'build',
				executionRoot: 'root',
				componentTypeId: 'type',
				instanceId: 'instance'
			},
			preview
		};
		expect(isExactRuntimeInspectionEvent(event)).toBe(true);
		expect(JSON.parse(JSON.stringify(preview))).toEqual({
			kind: 'constant',
			value: Object.is(value, -0) ? '-0' : String(value)
		});
		expect(isExactRuntimeInspectionEvent(JSON.parse(JSON.stringify(event)))).toBe(true);
	}
);

it.each(['', 'x'.repeat(513)])(
	'keeps unusual object keys compatible with event transport (%s)',
	(key) => {
		const preview = previewExactValue({ [key]: 'ok' });
		const event = {
			protocol: 1,
			cursor: '1',
			sequence: 1,
			timestamp: 0,
			kind: 'state.change',
			id: {
				sessionId: 'session',
				side: 'client',
				buildKey: 'build',
				executionRoot: 'root',
				componentTypeId: 'type',
				instanceId: 'instance'
			},
			preview
		};
		expect(isExactRuntimeInspectionEvent(event)).toBe(true);
		if (key === '')
			expect(preview).toMatchObject({
				entries: [{ key: '', value: { kind: 'scalar', value: 'ok' } }]
			});
		else expect(preview).toMatchObject({ kind: 'object', entries: [], truncated: true });
	}
);

it.each(['abcdef', '😀😀'])(
	'reserves the complete UTF-8 key before traversing its value (%s)',
	(key) => {
		let traversed = false;
		const preview = previewExactValue(
			{ [key]: { visible: 'ok' } },
			{
				limits: { maxBytes: 5 },
				redact(path) {
					if (path.length) traversed = true;
					return undefined;
				}
			}
		);
		expect(preview).toMatchObject({ kind: 'object', entries: [], truncated: true });
		expect(traversed).toBe(false);
	}
);

it('marks an Error preview truncated when its own details exceed the entry budget', () => {
	const error = new Error('primary', { cause: 'secondary' });
	expect(previewExactValue(error, { limits: { maxEntries: 1 } })).toMatchObject({
		kind: 'object',
		truncated: true,
		entries: [{ key: 'message', value: { kind: 'scalar', value: 'primary' } }]
	});
});

it.each([null, 12, 'x'.repeat(513)])('rejects an invalid incoming preview key (%s)', (key) => {
	expect(
		isExactRuntimeInspectionEvent({
			protocol: 1,
			cursor: '1',
			sequence: 1,
			timestamp: 0,
			kind: 'state.change',
			id: {
				sessionId: 'session',
				side: 'client',
				buildKey: 'build',
				executionRoot: 'root',
				componentTypeId: 'type',
				instanceId: 'instance'
			},
			preview: {
				kind: 'object',
				type: 'Object',
				truncated: false,
				entries: [{ key, value: { kind: 'scalar', value: 'ok' } }]
			}
		})
	).toBe(false);
});

it.each(['undefined', 'NaN', 'Infinity', '-Infinity', '-0'])(
	'keeps the ordinary string %s separate from a constant',
	(value) => {
		expect(previewExactValue(value)).toEqual({ kind: 'scalar', value });
	}
);

it.each(['null', 'unknown', ['NaN'], null])('rejects an invalid constant token (%s)', (value) => {
	expect(
		isExactRuntimeInspectionEvent({
			protocol: 1,
			cursor: '1',
			sequence: 1,
			timestamp: 0,
			kind: 'state.change',
			id: {
				sessionId: 'session',
				side: 'client',
				buildKey: 'build',
				executionRoot: 'root',
				componentTypeId: 'type',
				instanceId: 'instance'
			},
			preview: { kind: 'constant', value }
		})
	).toBe(false);
});

it('returns ordinary independent preview data under TypeScript readonly declarations', () => {
	const value = { count: 1 };
	const preview = previewExactValue(value);
	if (preview.kind !== 'object' || preview.entries[0]?.value.kind !== 'scalar')
		throw new Error('preview control');
	const scalar: { value: string | number | boolean | null } = preview.entries[0].value;
	scalar.value = 2;
	(preview.entries as unknown[]).length = 0;
	expect(value.count).toBe(1);
	expect(previewExactValue(value)).toMatchObject({
		entries: [{ key: 'count', value: { value: 1 } }]
	});
	const redacted = redactExactValue('secret');
	if (redacted.kind !== 'redacted') throw new Error('redaction control');
	const writable: { reason: string } = redacted;
	writable.reason = 'observation';
	expect(redactExactValue('secret')).toEqual({ kind: 'redacted', reason: 'secret' });
});

it('isolates writable policy path aliases from descendant redaction authority', () => {
	const value = { settings: { token: 'must-never-escape' } };
	const preview = previewExactValue(value, {
		redact(path) {
			const qualified = path.join('.');
			if (qualified === 'settings') (path as string[]).length = 0;
			return qualified === 'settings.token' ? 'secret' : undefined;
		}
	});
	expect(JSON.stringify(preview)).not.toContain('must-never-escape');
	expect(preview).toMatchObject({
		entries: [
			{
				key: 'settings',
				value: { entries: [{ key: 'token', value: { kind: 'redacted', reason: 'secret' } }] }
			}
		]
	});
});

it.each([null, false, '', 'unknown-policy', {}, 0])(
	'fails closed for malformed redaction policy output %j',
	(invalid) => {
		const preview = previewExactValue('must-never-escape', {
			redact: () => invalid as unknown as 'secret'
		});
		expect(preview).toEqual({ kind: 'unavailable', reason: 'redaction-failed' });
		expect(JSON.stringify(preview)).not.toContain('must-never-escape');
	}
);

it.each(['secret', 'server-resource', 'policy'] as const)(
	'accepts the supported redaction reason %s',
	(reason) => {
		expect(previewExactValue('protected', { redact: () => reason })).toEqual({
			kind: 'redacted',
			reason
		});
	}
);

it('requires a callable configured redactor while preserving ordinary omission', () => {
	// @ts-expect-error Null is not a supported redaction callback.
	const rejected = previewExactValue('private-value', { redact: null });
	expect(rejected).toEqual({ kind: 'unavailable', reason: 'redaction-failed' });
	expect(previewExactValue('visible', { redact: undefined })).toEqual({
		kind: 'scalar',
		value: 'visible'
	});
});

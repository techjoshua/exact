import { isExactRuntimeInspectionEvent, previewExactValue } from '@exactjs/devtools-protocol';

/** Verifies inspection preserves collection data without executing authored iterators or type getters. */
export function inspectionPreviewJourney() {
	const results = [];
	for (const kind of ['Map', 'Set']) {
		for (const mode of ['getter', 'callback']) {
			let calls = 0;
			const value = kind === 'Map' ? new Map([['visible', 'ok']]) : new Set(['ok']);
			const callback = () => {
				calls++;
				throw new Error('authored iterator');
			};
			Object.defineProperty(
				value,
				Symbol.iterator,
				mode === 'getter' ? { get: callback } : { value: callback }
			);
			const preview = previewExactValue(value);
			results.push(
				calls === 0 &&
					preview.kind === 'object' &&
					preview.type === kind &&
					!preview.truncated &&
					JSON.stringify(preview).includes('ok')
			);
		}
	}
	for (const key of ['constructor', 'name']) {
		let calls = 0;
		const constructor = function ApplicationValue() {};
		const prototype = { constructor };
		Object.defineProperty(key === 'constructor' ? prototype : constructor, key, {
			get() {
				calls++;
				throw new Error('authored accessor');
			}
		});
		const value = Object.assign(Object.create(prototype), { visible: 'ok' });
		const preview = previewExactValue(value);
		results.push(
			calls === 0 &&
				preview.kind === 'object' &&
				preview.type === 'Object' &&
				JSON.stringify(preview).includes('ok')
		);
	}
	const depthLimited = previewExactValue(
		Object.create({
			get constructor() {
				throw new Error('authored constructor');
			}
		}),
		{ limits: { maxDepth: 1 } }
	);
	results.push(depthLimited.kind === 'object');
	for (const value of [undefined, NaN, Infinity, -Infinity, -0]) {
		const preview = previewExactValue(value);
		const event = {
			protocol: 1,
			cursor: '1',
			sequence: 1,
			timestamp: 0,
			kind: 'state.change',
			id: {
				sessionId: 'session',
				side: 'server',
				buildKey: 'build',
				executionRoot: 'root',
				componentTypeId: 'type',
				instanceId: 'instance'
			},
			preview
		};
		results.push(
			isExactRuntimeInspectionEvent(event) &&
				isExactRuntimeInspectionEvent(JSON.parse(JSON.stringify(event))) &&
				preview.kind === 'constant' &&
				JSON.parse(JSON.stringify(preview)).value ===
					(Object.is(value, -0) ? '-0' : String(value)) &&
				previewExactValue(String(value)).kind === 'scalar'
		);
	}
	for (const key of ['', 'x'.repeat(513)]) {
		const preview = previewExactValue({ [key]: 'ok' });
		const event = {
			protocol: 1,
			cursor: '1',
			sequence: 1,
			timestamp: 0,
			kind: 'state.change',
			id: {
				sessionId: 'session',
				side: 'server',
				buildKey: 'build',
				executionRoot: 'root',
				componentTypeId: 'type',
				instanceId: 'instance'
			},
			preview
		};
		results.push(
			isExactRuntimeInspectionEvent(event) &&
				(key === ''
					? preview.entries?.[0]?.key === ''
					: preview.truncated && preview.entries.length === 0)
		);
	}
	for (const key of ['abcdef', '😀😀']) {
		let traversed = false;
		const preview = previewExactValue(
			{ [key]: { visible: 'ok' } },
			{
				limits: { maxBytes: 5 },
				redact(path) {
					if (path.length) traversed = true;
				}
			}
		);
		results.push(
			!traversed && preview.kind === 'object' && preview.truncated && preview.entries.length === 0
		);
	}
	const error = previewExactValue(new Error('primary', { cause: 'secondary' }), {
		limits: { maxEntries: 1 }
	});
	results.push(
		error.kind === 'object' &&
			error.truncated &&
			error.entries.length === 1 &&
			error.entries[0].key === 'message'
	);
	return results;
}

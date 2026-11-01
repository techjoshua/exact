// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderExactValuePreview } from './value-preview.js';

it.each(['undefined', 'NaN', 'Infinity', '-Infinity', '-0'] as const)(
	'distinguishes the %s constant from an identically named string',
	(value) => {
		const constant = renderExactValuePreview({ kind: 'constant', value }, []);
		const string = renderExactValuePreview({ kind: 'scalar', value }, []);
		expect(constant.textContent).toBe(value);
		expect(string.textContent).toBe(JSON.stringify(value));
		const object = renderExactValuePreview(
			{
				kind: 'object',
				type: 'Object',
				truncated: false,
				entries: [
					{ key: 'constant', value: { kind: 'constant', value } },
					{ key: 'string', value: { kind: 'scalar', value } }
				]
			},
			[]
		);
		expect(object.querySelector('summary')?.textContent).toBe(
			`{"constant": ${value}, "string": ${JSON.stringify(value)}}`
		);
	}
);

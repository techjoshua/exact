import { describe, expect, it } from 'vitest';
import { unsafeHtml } from '@exactjs/core';
import { renderAttrs } from './markup.js';

describe('native SSR property boundary', () => {
	it.each(['innerHTML', 'INNERHTML', 'outerHTML', 'OUTERHTML', 'dangerouslySetInnerHTML'])(
		'rejects %s from a dynamic bag',
		(name) => {
			expect(() => renderAttrs({ [name]: '<img onerror="bad">' })).toThrow('unsafeHtml()');
		}
	);
	it.each(['onclick', 'onClick', 'ONCLICK', 'onerror'])(
		'requires a callback and never serializes %s',
		(name) => {
			expect(() => renderAttrs({ [name]: 'bad()' })).toThrow('event handlers must be functions');
			expect(renderAttrs({ [name]: () => undefined })).toBe('');
		}
	);
	it.each(['srcdoc', 'srcDoc', 'SRCDOC'])('requires an opted-in receipt for %s', (name) => {
		expect(() => renderAttrs({ [name]: '<p>bad</p>' }, false, 'iframe')).toThrow('unsafeHtml()');
		expect(() => renderAttrs({ [name]: unsafeHtml('<p>trusted</p>') }, false, 'iframe')).toThrow(
			'allowUnsafeHtml'
		);
		expect(
			renderAttrs({ [name]: unsafeHtml('<p>trusted</p>') }, false, 'iframe', {
				allowUnsafeHtml: true
			})
		).toBe(' srcdoc="&lt;p&gt;trusted&lt;/p&gt;"');
	});
});

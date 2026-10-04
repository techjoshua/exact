/** @vitest-environment jsdom */
import type { ExactDomRenderProgram } from '@exactjs/core/runtime/render-operations';
import { expect, it } from 'vitest';
import { HTML_NAMESPACE, MATHML_NAMESPACE, SVG_NAMESPACE } from '../namespace.js';
import { materializeProgramTemplate } from './render-program-template.js';

for (const namespace of ['mathml', 'svg'] as const) {
	it(`preserves foreign ${namespace} template topology across HTML breakout tags and cached clones`, () => {
		const program: ExactDomRenderProgram = {
			version: 2,
			id: `foreign-${namespace}`,
			namespace,
			template:
				'<g><span data-label="&lt;input&gt;">A &amp; B<input></span><foreignObject><div>HTML</div></foreignObject></g>',
			directClaims: true,
			root: ['g'],
			work: [1, 0]
		};
		const roots = Array.from(
			{ length: 3 },
			() => materializeProgramTemplate(program, document).firstElementChild!
		);
		for (const root of roots) {
			const expected = namespace === 'svg' ? SVG_NAMESPACE : MATHML_NAMESPACE;
			expect(root.namespaceURI).toBe(expected);
			expect(root.children).toHaveLength(2);
			expect(root.firstElementChild?.namespaceURI).toBe(expected);
			expect(root.firstElementChild?.textContent).toBe('A & B');
			expect(root.firstElementChild?.getAttribute('data-label')).toBe('<input>');
			expect(root.firstElementChild?.firstElementChild?.namespaceURI).toBe(expected);
			expect(root.lastElementChild?.localName).toBe('foreignObject');
			expect(root.lastElementChild?.firstElementChild?.namespaceURI).toBe(
				namespace === 'svg' ? HTML_NAMESPACE : MATHML_NAMESPACE
			);
		}
		expect(roots[0]).not.toBe(roots[1]);
	});
}

it('respects MathML text and annotation integration points within a foreign template', () => {
	const program: ExactDomRenderProgram = {
		version: 2,
		id: 'foreign-integration',
		namespace: 'mathml',
		template:
			'<mrow><mtext><span>HTML</span><mglyph></mglyph></mtext><annotation-xml encoding="TEXT/HTML"><button>HTML</button></annotation-xml><annotation-xml encoding="application/xml"><span>MathML</span></annotation-xml></mrow>',
		directClaims: true,
		root: ['mrow'],
		work: [1, 0]
	};
	const root = materializeProgramTemplate(program, document).firstElementChild!;
	expect(root.querySelector('mtext span')?.namespaceURI).toBe(HTML_NAMESPACE);
	expect(root.querySelector('mglyph')?.namespaceURI).toBe(MATHML_NAMESPACE);
	expect(root.querySelector('button')?.namespaceURI).toBe(HTML_NAMESPACE);
	expect(root.lastElementChild?.firstElementChild?.namespaceURI).toBe(MATHML_NAMESPACE);
});

it('preserves nested foreign blocks, namespaced attributes and explicit namespace roots', () => {
	const program: ExactDomRenderProgram = {
		version: 2,
		id: 'foreign-blocks',
		namespace: 'svg',
		template:
			'<g><p><div>nested</div></p><a xlink:href="#shape"></a><foreignObject><math><mtext><span>HTML</span></mtext></math></foreignObject></g>',
		directClaims: true,
		root: ['g'],
		work: [1, 0]
	};
	const root = materializeProgramTemplate(program, document).firstElementChild!;
	expect(root.children).toHaveLength(3);
	expect(root.firstElementChild?.firstElementChild?.namespaceURI).toBe(SVG_NAMESPACE);
	expect(root.querySelector('a')?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(
		'#shape'
	);
	expect(root.querySelector('math')?.namespaceURI).toBe(MATHML_NAMESPACE);
	expect(root.querySelector('span')?.namespaceURI).toBe(HTML_NAMESPACE);
});

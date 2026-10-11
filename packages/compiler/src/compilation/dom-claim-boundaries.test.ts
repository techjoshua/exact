/** @vitest-environment jsdom */
import { expect, it, onTestFinished } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import type { AnyComponentFunction } from '@exactjs/core';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';

const button =
	'<button data-counter="" onClick={()=>this.state.count++}>{this.state.count}</button>';
const surround = (content: string, depth: number) =>
	'<section>'.repeat(depth) + content + '</section>'.repeat(depth);
const siblings = (width: number) =>
	'<i>static</i>'.repeat(width) + button + '<i>static</i>'.repeat(width);
const propertyButton =
	'<button data-counter="" data-count={this.state.count} onClick={()=>this.state.count++}>Increment</button>';
const cases = [
	{ name: 'property-only eight ancestors', content: surround(propertyButton, 8) },
	{
		name: 'property-only 64 siblings on either side',
		content: '<i>static</i>'.repeat(64) + propertyButton + '<i>static</i>'.repeat(64)
	},
	{
		name: 'property-only variable ranges on either side',
		content: `{this.state.visible ? <i data-left="">left</i> : null}${propertyButton}{this.state.visible ? <i data-right="">right</i> : null}`
	},
	{
		name: 'contextual SVG property-only fallback',
		svg: true,
		declarations:
			'function Shape(props:{count:number;advance:()=>void}){return()=> <g>' +
			'<g>'.repeat(8) +
			'<circle data-counter="" data-count={props.count} onClick={props.advance}/>' +
			'</g>'.repeat(8) +
			'</g>;}',
		content: '<svg><Shape count={this.state.count} advance={()=>this.state.count++}/></svg>'
	},
	{
		name: 'contextual SVG targeted claim',
		svg: true,
		declarations:
			'function Shape(props:{count:number;advance:()=>void}){return()=> <circle data-counter="" data-count={props.count} onClick={props.advance}/>;}',
		content: '<svg><Shape count={this.state.count} advance={()=>this.state.count++}/></svg>'
	},
	{
		name: 'contextual SVG conditional region',
		svg: true,
		declarations:
			'function Shape(props:{count:number;advance:()=>void}){return()=> <g>{props.count >= 0 ? <circle data-counter="" data-count={props.count} onClick={props.advance}/> : null}</g>;}',
		content: '<svg><Shape count={this.state.count} advance={()=>this.state.count++}/></svg>'
	},
	{
		name: 'component inside SVG HTML integration point',
		declarations:
			'function Control(props:{count:number;advance:()=>void}){return()=> <button data-counter="" data-count={props.count} onClick={props.advance}>Increment</button>;}',
		content:
			'<svg><foreignObject><Control count={this.state.count} advance={()=>this.state.count++}/></foreignObject></svg>'
	},
	{
		name: 'mixed empty text fragment component and enhanced siblings',
		declarations: `import * as theme from '@exactjs/theme/enhancements' with {type:'exact-enhancement'};
export let removed=0;
function Badge(this:Component<{}>){this.onUnmount(()=>removed++);return()=> <em data-badge="">badge</em>;}`,
		content: `<>{null}{false}{0}{'lead'}{this.state.visible ? <Badge key="badge"/> : null}</>${propertyButton}<span theme:scope theme:appearance="inverse"><>{undefined}{'tail'}{this.state.visible ? <i data-right="">right</i> : null}</></span>`
	},
	{
		name: 'contextual MathML component root',
		mathml: true,
		declarations:
			'function Symbol(props:{count:number;advance:()=>void}){return()=> <mi data-counter="" data-count={props.count} onClick={props.advance}>x</mi>;}',
		content:
			'<math><mrow><Symbol count={this.state.count} advance={()=>this.state.count++}/></mrow></math>'
	},
	{
		name: 'component at MathML text integration point',
		declarations:
			'function Control(props:{count:number;advance:()=>void}){return()=> <button data-counter="" data-count={props.count} onClick={props.advance}>Increment</button>;}',
		content:
			'<math><mtext><Control count={this.state.count} advance={()=>this.state.count++}/></mtext></math>'
	},
	{
		name: 'direct MathML text integration point',
		content: `<math><mtext>${propertyButton}</mtext></math>`
	},
	...['mi', 'mo', 'mn', 'ms', 'mtext'].map((tag) => ({
		name: `MathML ${tag} text integration with glyph exceptions`,
		content: `<math><${tag}><mglyph data-glyph=""/><malignmark data-mark=""/>${propertyButton}</${tag}></math>`
	})),
	...['text/html', 'application/xhtml+xml', 'TEXT/HTML'].map((encoding) => ({
		name: `MathML annotation encoding ${encoding}`,
		content: `<math><annotation-xml encoding="${encoding}">${propertyButton}</annotation-xml></math>`
	})),
	{
		name: 'dynamic MathML annotation encoding',
		content: `<math><annotation-xml encoding={this.state.visible ? 'text/html' : 'application/xhtml+xml'}>${propertyButton}</annotation-xml></math>`
	},
	{ name: 'seven ancestors', content: surround(button, 7) },
	{ name: 'eight ancestors', content: surround(button, 8) },
	{ name: '63 siblings on either side', content: siblings(63) },
	{ name: '64 siblings on either side', content: siblings(64) },
	{
		name: 'variable ranges on either side',
		content: `{this.state.visible ? <i data-left="">left</i> : null}${button}{this.state.visible ? <i data-right="">right</i> : null}`
	},
	{
		name: 'deep SVG to HTML transition',
		content:
			'<svg><g><g><g><g><g><foreignObject>' +
			surround(button, 2) +
			'</foreignObject></g></g></g></g></g></svg>'
	}
];

it.each(cases)(
	'retains identity and updates across DOM claim fallback: $name',
	async ({ content, svg, mathml, declarations }) => {
		const root = await createTestWorkspace('.exact-claim-boundaries-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		await writeFile(
			entry,
			`import {type Component} from '@exactjs/core';
${declarations ?? ''}
export let owner:Component<{count:number;visible:boolean}>;
export function Page(this:Component<{count:number;visible:boolean}>){owner=this;this.state.count=0;this.state.visible=true;return()=> <article>${content}</article>;}`
		);
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		for (const mode of ['mount', 'hydrate'] as const) {
			const container = document.createElement('div');
			onTestFinished(() => {
				unmount(container);
			});
			const reports: unknown[] = [];
			let original: Element | null = null;
			if (mode === 'hydrate') {
				const output = await renderToHydratableString(receipt(server.Page as never, {}));
				container.innerHTML = output.html;
				original = container.querySelector('[data-counter]');
				hydrate(receipt(client.Page as never, {}), container, {
					...composeExactComponentContracts([client.Page as AnyComponentFunction], 'client'),
					resumptions: output.resumptions,
					onMismatch: 'throw',
					onErrorReport: (r) => reports.push(r.error)
				});
			} else
				render(receipt(client.Page as never, {}), container, {
					onErrorReport: (r) => reports.push(r.error)
				});
			const counter = container.querySelector<HTMLButtonElement>('[data-counter]')!;
			expect(counter).not.toBeNull();
			for (const glyph of container.querySelectorAll('[data-glyph], [data-mark]'))
				expect(glyph.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
			if (original) expect(counter).toBe(original);
			expect(counter.namespaceURI).toBe(
				svg
					? 'http://www.w3.org/2000/svg'
					: mathml
						? 'http://www.w3.org/1998/Math/MathML'
						: 'http://www.w3.org/1999/xhtml'
			);
			counter.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync();
			expect(
				counter.hasAttribute('data-count')
					? counter.getAttribute('data-count')
					: counter.textContent
			).toBe('1');
			const owner = client.owner as { state: { count: number; visible: boolean } };
			const removedBefore = client.removed as number;
			if (content.includes('Badge key'))
				expect(container.querySelector('[data-badge]')).not.toBeNull();
			owner.state.visible = false;
			flushSync();
			expect(container.querySelector('[data-counter]')).toBe(counter);
			expect(container.querySelector('[data-left]')).toBeNull();
			if (content.includes('Badge key')) {
				expect(container.querySelector('[data-badge]')).toBeNull();
				expect(client.removed).toBe(removedBefore + 1);
			}
			owner.state.visible = true;
			flushSync();
			counter.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync();
			expect(
				counter.hasAttribute('data-count')
					? counter.getAttribute('data-count')
					: counter.textContent
			).toBe('2');
			expect(container.querySelector('[data-counter]')).toBe(counter);
			expect(reports).toEqual([]);
			unmount(container);
			expect(container.childNodes).toHaveLength(0);
		}
	}
);

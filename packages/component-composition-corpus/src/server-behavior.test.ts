import {
	renderToProgressiveHtmlStream,
	renderToStream,
	renderToString,
	renderToStringAsync
} from '@exactjs/ssr/enhanced';
import { describe, expect, it } from 'vitest';
import { capabilitiesRoot } from './scenarios/capabilities.fixtures.js?exact-target=server';
import { dynamicRoot } from './scenarios/dynamic.fixtures.js?exact-target=server';
import { enhancementsRoot } from './scenarios/enhancements.fixtures.js?exact-target=server';
import {
	corpus as serverCorpusEnhancement,
	enhancementTones as serverEnhancementTones,
	resetEnhancementTones as resetServerEnhancementTones
} from './scenarios/enhancement-implementation.fixtures.js?exact-target=server';
import { fundamentalsRoot } from './scenarios/fundamentals.fixtures.js?exact-target=server';
import {
	lazyRegistryRoot,
	registryRoot
} from './scenarios/registry.fixtures.js?exact-target=server';
import { stateRoot } from './scenarios/state.fixtures.js?exact-target=server';
import { structureRoot } from './scenarios/structure.fixtures.js?exact-target=server';
import { serverTaskRoot } from './scenarios/tasks.fixtures.js?exact-target=server';

describe('composition corpus server behavior', () => {
	it('renders the normative sync compositions directly', () => {
		expect(renderToString(fundamentalsRoot('server'), { markers: false }).html).toBe(
			'<main data-scenario="fundamentals"><h1>Composition corpus</h1><strong data-role="label">server</strong></main>'
		);
		expect(renderToString(stateRoot('count'), { markers: false }).html).toContain('count:1');
		expect(renderToString(structureRoot, { markers: false }).html).toContain('visible');
		expect(renderToString(capabilitiesRoot, { markers: false }).html).toContain('provided');
		expect(renderToString(registryRoot('second'), { markers: false }).html).toContain('second');
	});

	it('leaves an open dynamic component inert during async server rendering', async () => {
		const rendered = await renderToStringAsync(dynamicRoot(), { markers: false });
		expect(rendered.html).toBe('<section data-scenario="dynamic"></section>');
	});

	it('renders both enhancement target forms on the server', () => {
		resetServerEnhancementTones();
		const html = renderToString(enhancementsRoot, {
			markers: false,
			enhancementCatalog: new Map([
				['./enhancement-routing.fixtures.js#corpus', serverCorpusEnhancement]
			])
		}).html;
		expect(html).toContain('data-corpus-tone="intrinsic"');
		expect(serverEnhancementTones()).toEqual(['intrinsic', 'component']);
		expect(html).toContain('data-corpus-tone="component"');
	});

	it('settles blocking server tasks in async rendering', async () => {
		const rendered = await renderToStringAsync(serverTaskRoot, { markers: false });
		expect(rendered.html).toContain('ready');
	});

	it('loads a finite lazy registry entry in async rendering', async () => {
		const rendered = await renderToStringAsync(lazyRegistryRoot, { markers: false });
		expect(rendered.html).toContain('lazy second');
	});

	it('streams the same semantic result as sync rendering', async () => {
		const streamed = await streamText(
			renderToStream(fundamentalsRoot('stream'), { markers: false })
		);
		expect(streamed).toContain('<strong data-role="label">stream</strong>');
	});

	it('emits progressive task output that settles to the normative state', async () => {
		const html = await streamText(
			renderToProgressiveHtmlStream(serverTaskRoot, { markers: false, rootId: 'corpus' })
		);
		expect(html).toContain('ready');
	});
});

async function streamText(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let output = '';
	while (true) {
		const chunk = await reader.read();
		if (chunk.done) return output;
		output += decoder.decode(chunk.value, { stream: true });
	}
}

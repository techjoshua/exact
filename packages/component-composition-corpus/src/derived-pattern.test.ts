import { dispose, render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { expect, it, onTestFinished } from 'vitest';
import { derivedPatternRoot } from './test-support/derived-pattern.fixtures.js';
import { derivedPatternRoot as serverRoot } from './test-support/derived-pattern.fixtures.js?exact-target=server';
for (const mode of ['mount', 'hydrate'])
	it(`updates destructured aliases defaults and rest through ${mode}`, async () => {
		const host = document.createElement('div');
		document.body.append(host);
		onTestFinished(() => {
			dispose(host, true);
			host.remove();
		});
		if (mode === 'hydrate') {
			const output = await renderToHydratableString(serverRoot());
			host.innerHTML = output.html;
			hydrate(derivedPatternRoot(), host, { resumptions: output.resumptions, onMismatch: 'throw' });
		} else render(derivedPatternRoot(), host);
		const text = () => host.querySelector('output')!.textContent;
		expect(text()).toBe('a,b:2|a,b:|fallback:fallback|a,b|L');
		host.querySelectorAll('button')[0].click();
		flushSync();
		expect(text()).toBe('c,d,e:3|c,d:e|next:next|a,b|R');
		host.querySelectorAll('button')[1].click();
		flushSync();
		expect(text()).toBe('c,d,e:3|c,d:e|actual:actual|a,b|R');
	});

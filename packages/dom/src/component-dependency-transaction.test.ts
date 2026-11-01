/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { verifyComponentDependencyTransaction } from '../../component-composition-corpus/test-support/component-dependency-journey.js';

it('publishes direct-owner inputs and disposes the owned source transaction fixture', async () => {
	expect(await verifyComponentDependencyTransaction()).toEqual({
		retained: true,
		input: true,
		progress: true,
		cleanup: true,
		fresh: true,
		reports: []
	});
});

it('strictly adopts the marked direct-owner program before input and state updates', async () => {
	const { renderToHydratableString } = await import('@exactjs/ssr');
	const { hydrate } = await import('../../hydrate/src/root.js');
	const fixture = await import(
		'../../component-composition-corpus/test-support/component-dependency.fixtures.js'
	);
	const server = await import(
		'../../component-composition-corpus/test-support/component-dependency.fixtures.js?exact-target=server'
	);
	const program = await import('./renderer/render-program-components.js');
	const { flushSync } = await import('@exactjs/reactive');
	const { vi } = await import('vitest');
	const reports: unknown[] = [];
	const host = document.createElement('main');
	const rendered = await renderToHydratableString(server.dependencyRoot('first'));
	document.body.append(host);
	host.innerHTML = rendered.html;
	const section = host.querySelector('[data-dependency-owner]');
	const child = host.querySelector('[data-dependency-child]');
	const button = host.querySelector('button');
	expect(section).not.toBeNull();
	expect(child).not.toBeNull();
	expect(button).not.toBeNull();
	const bindProgram = program.bindProgramComponent;
	let adoptedComponentSlots = 0;
	const bind = vi
		.spyOn(program, 'bindProgramComponent')
		.mockImplementation((mounted, index, initial) => {
			if (initial && mounted.renderProgram?.childSlots?.[index]?.children.length)
				adoptedComponentSlots++;
			return bindProgram(mounted, index, initial);
		});
	let root: ReturnType<typeof hydrate> | undefined;
	try {
		root = hydrate(fixture.dependencyRoot('first'), host, {
			onMismatch: 'throw',
			resumptions: rendered.resumptions,
			onErrorReport: (report) => reports.push(report)
		});
		await root.whenSettled();
		expect(adoptedComponentSlots).toBeGreaterThan(0);
		expect(reports).toEqual([]);
		expect(host.querySelector('[data-dependency-owner]')).toBe(section);
		expect(host.querySelector('[data-dependency-child]')).toBe(child);
		expect(host.querySelector('button')).toBe(button);
		const owner = fixture.dependencyOwner;
		expect(owner.refs.get(fixture.dependencyButton)).toBe(button);
		fixture.mountDependencyOwner(host, 'second', {
			onErrorReport: (report) => reports.push(report)
		});
		flushSync();
		expect(fixture.dependencyOwner).toBe(owner);
		expect(host.querySelector('[data-dependency-owner]')).toBe(section);
		expect(host.querySelector('[data-dependency-child]')).toBe(child);
		expect(section?.getAttribute('title')).toBe('second');
		expect(child?.textContent).toBe('second');
		button?.click();
		flushSync();
		expect(host.querySelector('[data-dependency-count]')?.textContent).toBe('1');
		root.dispose();
		expect(owner.refs.get(fixture.dependencyButton)).toBeUndefined();
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	} finally {
		root?.dispose();
		bind.mockRestore();
		host.remove();
	}
});

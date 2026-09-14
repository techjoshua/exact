import { expect, it } from 'vitest';
import { renderToHydratableProgressiveHtmlStream, renderToHydratableString } from './index.js';
import {
	ApplicationShell,
	PlainShellApplication,
	ReactiveDocument,
	ShellApplication,
	TaskOwnedDocument,
	StreamingTaskDocument,
	failShellApplication,
	renderShellApplication,
	resetShellApplication,
	shellApplicationDisposals,
	shellApplicationStarted,
	taskOwnedDocumentReads
} from './document-shell.fixtures.test.js';
import { createOperation } from './test-support/native-operations.js';
import type { Child } from './types.js';

const wrap = (application: Child) =>
	createOperation(ApplicationShell, { title: 'private shell title' }, application);

it('sends a static head before the same component task completes', async () => {
	const settle = resetShellApplication();
	const reader = renderToHydratableProgressiveHtmlStream(
		createOperation(StreamingTaskDocument, {})
	).getReader();
	try {
		const first = new TextDecoder().decode((await reader.read()).value);
		expect(first).toContain('</head>');
		expect(first).toContain('/app.css');
		expect(first).not.toContain('pending');
		settle();
		let html = first;
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			html += new TextDecoder().decode(next.value);
		}
		expect(html).toContain('ready');
		expect(html).not.toContain('pending');
		expect(html.match(/<head[ >]/g)).toHaveLength(1);
		expect(html).toMatch(/<\/body><\/html>$/);
		expect(shellApplicationDisposals()).toBe(1);
		const string = await renderToHydratableString(createOperation(StreamingTaskDocument, {}));
		expect(string.html).toContain('ready');
		expect(string.html).not.toContain('pending');
	} finally {
		settle();
		await reader.cancel();
		reader.releaseLock();
	}
});

it('cancels the task-owning document after publishing its static head', async () => {
	const settle = resetShellApplication();
	const reader = renderToHydratableProgressiveHtmlStream(
		createOperation(StreamingTaskDocument, {})
	).getReader();
	try {
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('</head>');
		await shellApplicationStarted();
		await reader.cancel('browser disconnected');
		expect(shellApplicationDisposals()).toBe(1);
	} finally {
		settle();
		await reader.cancel();
		reader.releaseLock();
	}
});

it('releases the document when its task fails after the head is published', async () => {
	const settle = resetShellApplication();
	const reader = renderToHydratableProgressiveHtmlStream(
		createOperation(StreamingTaskDocument, {}),
		{
			logger: { log() {} }
		}
	).getReader();
	try {
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('</head>');
		failShellApplication(new Error('private task failure'));
		let remainder = '';
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			remainder += new TextDecoder().decode(next.value);
		}
		expect(remainder).not.toContain('private task failure');
		expect(remainder).not.toContain('pending');
		expect(shellApplicationDisposals()).toBe(1);
	} finally {
		settle();
		await reader.cancel();
		reader.releaseLock();
	}
});

it('does not speculatively read pending state to discover a task-owned document', async () => {
	const settle = resetShellApplication();
	const reader = renderToHydratableProgressiveHtmlStream(
		createOperation(TaskOwnedDocument, {})
	).getReader();
	const completion = (async () => {
		let html = '';
		for (;;) {
			const next = await reader.read();
			if (next.done) return html;
			html += new TextDecoder().decode(next.value);
		}
	})();
	try {
		await shellApplicationStarted();
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(taskOwnedDocumentReads()).toEqual([]);
		settle();
		const html = await completion;
		expect(html).toContain('ready');
		expect(html).toMatch(/<\/body><\/html>$/);
		expect(taskOwnedDocumentReads()).toEqual(['ready']);
		expect(shellApplicationDisposals()).toBe(1);
	} finally {
		settle();
		await reader.cancel();
		await completion;
		reader.releaseLock();
	}
});

it('retains hydration state when the document is itself the requested root', async () => {
	const result = await renderToHydratableString(createOperation(ReactiveDocument, {}));
	expect(result.html).toContain('reactive document title');
	expect(result.hydrationScript).toContain('reactive document title');
});

it('keeps overlapping request captures independent', async () => {
	const settle = resetShellApplication();
	try {
		const first = renderShellApplication('first application');
		const second = renderShellApplication('second application');
		settle();
		const results = await Promise.all([first, second]);
		expect(results[0].hydrationScript).toContain('first application');
		expect(results[0].hydrationScript).not.toContain('second application');
		expect(results[1].hydrationScript).toContain('second application');
		expect(results[1].hydrationScript).not.toContain('first application');
		expect(shellApplicationDisposals()).toBe(2);
	} finally {
		settle();
	}
});

it('cancels pending application ownership after the shell has been delivered', async () => {
	const settle = resetShellApplication();
	const reader = renderToHydratableProgressiveHtmlStream(
		createOperation(ShellApplication, { message: 'cancelled application' }),
		{ documentShell: wrap }
	).getReader();
	try {
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('</head>');
		await shellApplicationStarted();
		await reader.cancel('browser disconnected');
		expect(shellApplicationDisposals()).toBe(1);
	} finally {
		settle();
		await reader.cancel();
		reader.releaseLock();
	}
});

it('publishes only application props and state while rendering the complete shell', async () => {
	const settle = resetShellApplication();
	settle();
	const result = await renderShellApplication('requested application');
	expect(result.html).toContain('private shell title');
	expect(result.html).toContain('shell sibling state');
	expect(result.html).toContain('inherited from shell');
	expect(result.hydrationScript).toContain('requested application');
	expect(result.hydrationScript).not.toContain('private shell title');
	expect(result.hydrationScript).not.toContain('shell sibling state');
	expect(shellApplicationDisposals()).toBe(1);
});

it('streams the shell before the requested application task settles', async () => {
	const settle = resetShellApplication();
	const reader = renderToHydratableProgressiveHtmlStream(
		createOperation(ShellApplication, { message: 'streamed application' }),
		{ publishRootProps: true, documentShell: wrap }
	).getReader();
	try {
		const first = new TextDecoder().decode((await reader.read()).value);
		expect(first).toContain('</head>');
		expect(first).not.toContain('streamed application: ready');
		settle();
		let html = first;
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			html += new TextDecoder().decode(next.value);
		}
		expect(html).toContain('streamed application: ready');
		expect(html).toMatch(/<\/body><\/html>$/);
		const payload = html.match(/<script type="application\/json"[^>]*>(.*?)<\/script>/s)?.[1];
		expect(payload).toBeDefined();
		expect(payload).not.toContain('private shell title');
		expect(payload).not.toContain('shell sibling state');
		expect(shellApplicationDisposals()).toBe(1);
	} finally {
		settle();
		await reader.cancel();
		reader.releaseLock();
	}
});

it.each(['missing', 'duplicate', 'fragment'])('rejects a %s application position', async (mode) => {
	const settle = resetShellApplication();
	settle();
	const root = createOperation(PlainShellApplication, {});
	const documentShell = (application: Child) =>
		mode === 'fragment'
			? createOperation('div', null, application)
			: createOperation(
					ApplicationShell,
					{ title: 'shell' },
					...(mode === 'missing' ? [] : [application, application])
				);
	await expect(
		renderToHydratableString(root, { publishRootProps: true, documentShell })
	).rejects.toThrow(/document shell/i);
});

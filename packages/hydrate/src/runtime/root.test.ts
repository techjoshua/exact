/**
 * @vitest-environment jsdom
 */
import { createComponentDomain } from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { describe, expect, it } from 'vitest';
import { createExactClient, requestClientForComponentDomain } from './client.js';
import { createExactRoot } from './root.js';
import {
	configureHiddenRemoteClient,
	HiddenRootArea,
	HiddenRootPage,
	readHiddenRootInstances,
	resetHiddenRootObservations
} from '../test-support/hidden-roots.fixtures.js';

describe('hidden exact roots', () => {
	it('selects request clients by instantiating root while preserving authored child ownership', () => {
		const container = document.createElement('div');
		const pageClient = createExactClient(container, { executionRoot: 'page' });
		const remoteClient = createExactClient(document.createElement('div'), {
			executionRoot: '@company/branding#./Shell'
		});
		resetHiddenRootObservations();
		configureHiddenRemoteClient(remoteClient);
		render(createExactRoot(pageClient, HiddenRootPage), container);
		const { pageChild, remoteShell, remoteButton } = readHiddenRootInstances();

		expect(container.textContent).toBe('violetviolet');
		expect(pageChild.domain).toBe(pageClient.domain);
		expect(remoteShell.domain).toBe(remoteClient.domain);
		expect(remoteButton.domain).toBe(remoteClient.domain);
		expect(requestClientForComponentDomain(pageChild.domain)).toBe(pageClient);
		expect(requestClientForComponentDomain(remoteShell.domain)).toBe(remoteClient);
		expect(requestClientForComponentDomain(remoteButton.domain)).toBe(remoteClient);

		unmount(container);
		pageClient.dispose();
		remoteClient.dispose();
		resetHiddenRootObservations();
	});

	it('releases every rotated domain and refuses to revive a disposed client', () => {
		const container = document.createElement('div');
		const client = createExactClient(container, { executionRoot: '@company/area#./Root' });
		const rotated = createComponentDomain({ executionRoot: '@company/area#./Root' });
		createExactRoot(client, HiddenRootArea, undefined, undefined, rotated);
		expect(requestClientForComponentDomain(client.domain)).toBe(client);
		expect(requestClientForComponentDomain(rotated)).toBe(client);

		client.dispose();
		expect(requestClientForComponentDomain(client.domain)).toBeUndefined();
		expect(requestClientForComponentDomain(rotated)).toBeUndefined();
		expect(() => createExactRoot(client, HiddenRootArea)).toThrow('inactive eXact client');

		const replacement = createExactClient(container, { executionRoot: '@company/area#./Root' });
		expect(replacement.domain).not.toBe(client.domain);
		expect(requestClientForComponentDomain(replacement.domain)).toBe(replacement);
		replacement.dispose();
	});
});
import '@exactjs/core/runtime/contexts';

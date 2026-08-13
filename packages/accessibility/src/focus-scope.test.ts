/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { FocusScopeSession } from './focus-scope.js';
import { testRefBinding, testRootBinding } from './test-support/ref-binding.js';

describe('@exactjs/accessibility focus scope', () => {
	it('focuses an explicit entry and restores the captured opener after removal', () => {
		const opener = document.createElement('button');
		const region = document.createElement('section');
		const input = document.createElement('input');
		region.append(input);
		document.body.append(opener, region);
		opener.focus();
		const target = testRootBinding<HTMLElement>(region);
		const session = new FocusScopeSession(target, {
			focusScope: true,
			initialFocus: testRefBinding(input)
		});

		session.reconcile();
		expect(document.activeElement).toBe(input);
		region.remove();
		session.reconcile();
		expect(document.activeElement).toBe(opener);
		session.dispose();
		opener.remove();
	});

	it('does not steal focus back after the user moves outside the scope', () => {
		const opener = document.createElement('button');
		const outside = document.createElement('button');
		const region = document.createElement('section');
		const input = document.createElement('input');
		region.append(input);
		document.body.append(opener, region, outside);
		opener.focus();
		const target = testRootBinding<HTMLElement>(region);
		const session = new FocusScopeSession(target, {
			focusScope: true,
			initialFocus: testRefBinding(input)
		});

		session.reconcile();
		outside.focus();
		region.remove();
		session.reconcile();
		expect(document.activeElement).toBe(outside);
		session.dispose();
		opener.remove();
		outside.remove();
	});

	it('adopts a hydrated scope without moving existing focus', () => {
		const opener = document.createElement('button');
		const region = document.createElement('section');
		const input = document.createElement('input');
		region.append(input);
		document.body.append(opener, region);
		opener.focus();
		const session = new FocusScopeSession(testRootBinding(region, 'hydration'), {
			focusScope: true,
			initialFocus: testRefBinding(input)
		});

		session.reconcile();
		expect(document.activeElement).toBe(opener);
		session.dispose();
		opener.remove();
		region.remove();
	});

	it('releases nested scopes in stack order without letting an outer scope steal focus', () => {
		const opener = document.createElement('button');
		const outer = document.createElement('section');
		const innerOpener = document.createElement('button');
		const inner = document.createElement('section');
		document.body.append(opener, outer);
		outer.append(innerOpener, inner);
		opener.focus();
		const outerSession = new FocusScopeSession(testRootBinding(outer), { focusScope: true });
		outerSession.reconcile();
		innerOpener.focus();
		const innerSession = new FocusScopeSession(testRootBinding(inner), { focusScope: true });
		innerSession.reconcile();
		inner.tabIndex = -1;
		inner.focus();

		outerSession.dispose();
		expect(document.activeElement).toBe(inner);
		innerSession.dispose();
		expect(document.activeElement).not.toBe(opener);
		opener.remove();
		outer.remove();
	});
});

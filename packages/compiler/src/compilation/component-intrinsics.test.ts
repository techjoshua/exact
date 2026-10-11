/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import type { AnyComponentFunction } from '@exactjs/core';
import { render, dispose } from '@exactjs/dom';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

// Compiler-owned branding and receipts must remain independent of application built-in bindings.
it.each(['client', 'server'] as const)(
	'preserves %s component contracts with module built-in bindings',
	async (target) => {
		for (const name of ['Object', 'Symbol'] as const) {
			const shadow =
				name === 'Symbol'
					? 'const Symbol={for(){throw new Error("authored Symbol.for invoked");}};void Symbol;'
					: 'const Object={assign(){throw new Error("authored Object.assign invoked");}};void Object;';
			const { compiled } = await privateHelperArtifact(
				shadow +
					'import type {Component} from "@exactjs/core";export function Page(this:Component<{value:number}>){this.state.value=0;return()=>String(this.state.value);}',
				target
			);
			const Page = compiled.Page as AnyComponentFunction;
			expect(Page.name).toBe('Page');
			if (target === 'server') {
				const rendered = await renderToHydratableString(createCompiledComponentReceipt(Page, {}));
				expect(rendered.html).toContain('0');
				continue;
			}
			const root = document.createElement('main');
			try {
				render(createCompiledComponentReceipt(compiled.Page as AnyComponentFunction, {}), root);
				expect(root.textContent).toBe('0');
			} finally {
				dispose(root, true);
				flushSync();
			}
		}
	}
);

// @vitest-environment jsdom
import { it } from 'vitest';
import { createElement } from '@exactjs/react-compat/react18';
import { createRoot, hydrateRoot } from './client18.js';
import { createPortal } from './index.js';
import { verifyReactHydrationOwnership } from '../../component-composition-corpus/test-support/react-hydration-ownership-journey.js';
it('adopts complete raw HTML and portal ownership across updates and removal', () =>
	verifyReactHydrationOwnership(
		{ createElement, createRoot, hydrateRoot, createPortal },
		document
	));

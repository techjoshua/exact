// @vitest-environment jsdom
import { act, createElement } from '@exactjs/react-compat/react18';
import { it } from 'vitest';
import { createRoot, hydrateRoot } from './client18.js';
import { verifyReactHostEvents } from '../../component-composition-corpus/test-support/react-event-journey.js';

it('owns React 18 host events through adoption and release', () =>
	verifyReactHostEvents({ act, createElement, createRoot, hydrateRoot }, document));

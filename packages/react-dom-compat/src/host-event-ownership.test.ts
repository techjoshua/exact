// @vitest-environment jsdom
import { act, createElement } from '@exactjs/react-compat';
import { it } from 'vitest';
import { createRoot, hydrateRoot } from './client.js';
import { verifyReactHostEvents } from '../../component-composition-corpus/test-support/react-event-journey.js';

it('owns host event failures across standalone and adopted roots', () =>
	verifyReactHostEvents({ act, createElement, createRoot, hydrateRoot }, document));

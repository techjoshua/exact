// @vitest-environment jsdom
import { act, createElement } from '@exactjs/react-compat';
import { createRoot } from './client.js';
import { it } from 'vitest';
import { verifyReactCleanup } from '../../component-composition-corpus/test-support/react-cleanup-journey.js';

it('retires every owned range after ref cleanup failures', () =>
	verifyReactCleanup({ act, createElement, createRoot }, document));

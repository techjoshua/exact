// @vitest-environment jsdom
import * as api from '@exactjs/react-compat';
import * as ownership from '@exactjs/react-compat/exact';
import { it } from 'vitest';
import { createRoot } from './client.js';
import { verifyReactHookCleanup } from '../../component-composition-corpus/test-support/react-hook-cleanup-journey.js';

it('retires Hook effects and subscriptions once while retaining the first failure', () =>
	verifyReactHookCleanup({ ...api, ...ownership, createRoot }, document));

// @vitest-environment jsdom
import * as api from '@exactjs/react-compat';
import * as ownership from '@exactjs/react-compat/exact';
import { it } from 'vitest';
import { createRoot } from './client.js';
import { verifyReactRefCleanup } from '../../component-composition-corpus/test-support/react-ref-journey.js';

it('owns each returned ref cleanup separately', () =>
	verifyReactRefCleanup({ ...api, ...ownership, createRoot }, document));

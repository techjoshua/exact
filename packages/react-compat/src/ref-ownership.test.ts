// @vitest-environment jsdom
import * as api from './index.js';
import * as ownership from './exact.js';
import { createRoot } from '@exactjs/react-dom-compat/client19';
import { it } from 'vitest';
import { verifyReactRefCleanup } from '../../component-composition-corpus/test-support/react-ref-journey.js';

it('releases independent ref assignments and fences queued class refs', () =>
	verifyReactRefCleanup({ ...api, ...ownership, createRoot }, document));

import { verifyReactHookCleanup } from '../../component-composition-corpus/test-support/react-hook-cleanup-journey.js';

it('releases effects and subscriptions before retained Activity work reconnects', () =>
	verifyReactHookCleanup({ ...api, ...ownership, createRoot }, document));

import { verifyReactEffectErrors } from '../../component-composition-corpus/test-support/react-effect-error-journey.js';

it('routes scheduled effect failures and fences retired effect work', () =>
	verifyReactEffectErrors({ ...api, createRoot }, document));

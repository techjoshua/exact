// @vitest-environment jsdom
import * as api from '@exactjs/react-compat/react18';
import * as ownership from '@exactjs/react-compat/exact';
import { it } from 'vitest';
import { createRoot } from './client18.js';
import { verifyReactHookCleanup } from '../../component-composition-corpus/test-support/react-hook-cleanup-journey.js';
import { verifyReactRefCleanup } from '../../component-composition-corpus/test-support/react-ref-journey.js';

it('releases React 18 effects and subscriptions before Activity reconnects', () =>
	verifyReactHookCleanup({ ...api, ...ownership, createRoot }, document));
it('releases React 18 ref assignments with independent cleanup leases', () =>
	verifyReactRefCleanup({ ...api, ...ownership, createRoot }, document));

import { verifyReactEffectErrors } from '../../component-composition-corpus/test-support/react-effect-error-journey.js';

it('reports React 18 scheduled effect failures through their owner', () =>
	verifyReactEffectErrors({ ...api, createRoot }, document));

import { createPortal } from './index.js';
import { verifyReactPreparation } from '../../component-composition-corpus/test-support/react-preparation-journey.js';

it('rolls back React 18 range preparation failures', () =>
	verifyReactPreparation({ ...api, createRoot, createPortal }, document));

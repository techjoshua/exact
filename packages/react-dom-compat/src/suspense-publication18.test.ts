// @vitest-environment jsdom
import * as api from '@exactjs/react-compat/react18';
import { it } from 'vitest';
import { createRoot } from './client18.js';
import { verifyReactSuspensePublication } from '../../component-composition-corpus/test-support/react-suspense-publication-journey.js';
it('keeps prepared Suspense ranges owned across prior ref cleanup failures', () =>
	verifyReactSuspensePublication({ ...api, createRoot }, document));

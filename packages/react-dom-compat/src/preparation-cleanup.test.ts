// @vitest-environment jsdom
import * as api from '@exactjs/react-compat';
import { it } from 'vitest';
import { createRoot } from './client.js';
import { createPortal } from './index.js';
import { verifyReactPreparation } from '../../component-composition-corpus/test-support/react-preparation-journey.js';

it('rolls back newly acquired ranges when preparation fails', () =>
	verifyReactPreparation({ ...api, createRoot, createPortal }, document));

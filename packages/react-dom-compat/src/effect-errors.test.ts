// @vitest-environment jsdom
import * as api from '@exactjs/react-compat';
import { it } from 'vitest';
import { createRoot } from './client.js';
import { verifyReactEffectErrors } from '../../component-composition-corpus/test-support/react-effect-error-journey.js';

it('reports scheduled effect failures through their owner and permits following work', () =>
	verifyReactEffectErrors({ ...api, createRoot }, document));

/** @vitest-environment jsdom */
import { it } from 'vitest';
import { act, createElement } from '@exactjs/react-compat';
import { createRoot } from '@exactjs/react-dom-compat/client19';
import * as modernApi from './modern.js';
import * as coreApi from './core.js';
import {
	verifyFetcherTargets,
	verifyFetcherDataTargets
} from '../../../packages/component-composition-corpus/test-support/router-fetcher-target-journey.js';

it('loads and submits to destination routes without transferring fetcher ownership', () =>
	verifyFetcherTargets({ ...modernApi, act, createElement, createRoot }, document));
it('selects URL data targets while preserving explicit native route selection', () =>
	verifyFetcherDataTargets(coreApi));

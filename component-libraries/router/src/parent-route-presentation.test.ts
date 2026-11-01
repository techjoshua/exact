/** @vitest-environment jsdom */
import { it } from 'vitest';
import { act, createElement } from '@exactjs/react-compat';
import { createRoot } from '@exactjs/react-dom-compat/client19';
import * as api from './modern.js';
import { verifyParentRoutePresentation } from '../../../packages/component-composition-corpus/test-support/router-matching-journey.js';

it('preserves parent presentation as child matches appear and disappear', () =>
	verifyParentRoutePresentation({ ...api, act, createElement, createRoot }, document));

/** @vitest-environment jsdom */
import { it } from 'vitest';
import { act, createElement } from '@exactjs/react-compat';
import { createRoot } from '@exactjs/react-dom-compat/client19';
import * as coreApi from './core.js';
import * as modernApi from './modern.js';
import {
	verifyRouteRecords,
	verifyRouteRecordReaders
} from '../../../packages/component-composition-corpus/test-support/router-record-journey.js';
it('preserves own route IDs and parameters without accepting inherited data', () =>
	verifyRouteRecords({ ...coreApi, createStaticHandler: modernApi.createStaticHandler }));
it('distinguishes missing route records from explicitly thrown undefined errors', () =>
	verifyRouteRecordReaders({ ...modernApi, act, createElement, createRoot }, document));

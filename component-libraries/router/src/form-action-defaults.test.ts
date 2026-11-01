/** @vitest-environment jsdom */
import { it } from 'vitest';
import { act, createElement } from '@exactjs/react-compat';
import { createRoot } from '@exactjs/react-dom-compat/client19';
import * as modernApi from './modern.js';
import * as coreApi from './core.js';
import {
	verifyFormActionDefaults,
	verifyIndexFormActions
} from '../../../packages/component-composition-corpus/test-support/router-form-action-journey.js';
const api = { ...modernApi, ...coreApi, act, createElement, createRoot };
it.each(['history', 'hash'] as const)(
	'retains current form defaults and submit callbacks in %s mode',
	(mode) => verifyFormActionDefaults(api, document, mode)
);
it.each(['history', 'hash'] as const)(
	'preserves index action queries and GET fields in %s mode',
	(mode) => verifyIndexFormActions(api, document, mode)
);

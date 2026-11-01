// @vitest-environment jsdom
import { it } from 'vitest';
import { createElement, Fragment } from '@exactjs/react-compat/react18';
import * as rootApi from './renderer/root.js';
import { verifyReactBoundedHydration } from '../../component-composition-corpus/test-support/react-bounded-hydration-journey.js';
it('keeps native hydration boundaries and foreign siblings owned', () =>
	verifyReactBoundedHydration({ ...rootApi, createElement, Fragment }, document));

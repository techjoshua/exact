import { it } from 'vitest';
import { Children, Component, createElement, Fragment } from './index.js';
import { toReactNode } from './exact.js';
import { verifyReactChildArrayValues } from '../../component-composition-corpus/test-support/react-child-array-journey.js';
it('preserves deep, sparse and owned child traversal through public utilities', () =>
	verifyReactChildArrayValues({ Children, Component, createElement, Fragment, toReactNode }));

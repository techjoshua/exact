import { it } from 'vitest';
import { createContinuationDependencySlot } from '@exactjs/core';
import { markContinuationDependencyValue } from '../../../core/src/tasks/dependency-provenance.js';
import { prepareComponentProps, prepareDirectComponentProps } from './component-props.js';
import {
	verifySsrPropCancellation,
	verifySsrPropPreparationCleanup
} from '../../../component-composition-corpus/test-support/ssr-prop-cancellation-journey.js';
it('preserves cancellation identity for initial and pending compiler-forwarded props', () =>
	verifySsrPropCancellation({
		createContinuationDependencySlot,
		markContinuationDependencyValue,
		prepareComponentProps,
		prepareDirectComponentProps
	}));

it('releases pending prop waits when another preparation stage fails', () =>
	verifySsrPropPreparationCleanup({
		createContinuationDependencySlot,
		markContinuationDependencyValue,
		prepareComponentProps,
		prepareDirectComponentProps
	}));

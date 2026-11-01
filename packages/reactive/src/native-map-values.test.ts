import { expect, it } from 'vitest';
import * as reactiveApi from './index.js';
import { createPendingReactiveTransaction } from './pending/pending-state.js';
import {
	mapNativeValueCases,
	verifyMapNativeValue
} from '../../component-composition-corpus/test-support/map-native-value-journey.mjs';
const api = { ...reactiveApi, createPendingReactiveTransaction };
it.each(mapNativeValueCases)('retains native Map value identity through %s', (mode) => {
	expect(verifyMapNativeValue(api, mode)).toBe(true);
});

import { createContext, createRef } from '@exact/core';

import type { FieldContextValue, FormContextValue } from './contracts.js';

/** Provides the canonical form context value. */
export const FormContext = createContext<FormContextValue>('exact.form', true);
/** Provides the canonical field context value. */
export const FieldContext = createContext<FieldContextValue>('exact.field', true);
/** Provides the canonical control ref value. */
export const ControlRef = createRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
	'exact.field.control'
);

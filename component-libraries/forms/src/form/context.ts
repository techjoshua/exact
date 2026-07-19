import { createContext, createRef } from '@exact/core';

import type { FieldContextValue, FormContextValue } from './contracts.js';

export const FormContext = createContext<FormContextValue>('exact.form', true);
export const FieldContext = createContext<FieldContextValue>('exact.field', true);
export const ControlRef = createRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
	'exact.field.control'
);

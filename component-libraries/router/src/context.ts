import { createContext } from '@exactjs/core';
import type { ExactRouteDefinition, ExactRouter } from './core.js';

/** Shared controller identity bridged by native eXact and React facades. */
export const RouterControllerContext = createContext<ExactRouter<ExactRouteDefinition>>(
	'exact.router.controller',
	{ global: true, reactive: true }
);

import { createContext } from '@exactjs/core';
/** Application value supplied by the server test. */
export const ApplicationName = createContext<string>('test.application', { scope: 'application' });
/** Request value supplied by the server test. */
export const RequestName = createContext<string>('test.request', { scope: 'request' });
/** Component-scoped value supplied by the rendered parent. */
export const Theme = createContext<string>('test.theme');

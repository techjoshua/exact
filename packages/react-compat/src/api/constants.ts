import {
	REACT_ACTIVITY_TYPE,
	REACT_FRAGMENT_TYPE,
	REACT_PROFILER_TYPE,
	REACT_STRICT_MODE_TYPE,
	REACT_SUSPENSE_TYPE,
	ReactSharedInternals18,
	ReactSharedInternals19
} from '../internals.js';

export const Fragment = REACT_FRAGMENT_TYPE;
export const StrictMode = REACT_STRICT_MODE_TYPE;
export const Profiler = REACT_PROFILER_TYPE;
export const Suspense = REACT_SUSPENSE_TYPE;
export const Activity = REACT_ACTIVITY_TYPE;
export const ViewTransition = Symbol.for('react.view_transition');
export const version = '19.2.0-exact';
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactSharedInternals18;
export const __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
	ReactSharedInternals19;
// React's server condition exposes a smaller view (H, A, stack bookkeeping).
// Keeping it on the same target singleton is intentional: a package graph must
// never acquire a second dispatcher merely because it crossed an export condition.
export const __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
	ReactSharedInternals19;

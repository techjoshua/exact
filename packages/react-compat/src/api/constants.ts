import {
	REACT_ACTIVITY_TYPE,
	REACT_FRAGMENT_TYPE,
	REACT_PROFILER_TYPE,
	REACT_STRICT_MODE_TYPE,
	REACT_SUSPENSE_TYPE,
	ReactSharedInternals18,
	ReactSharedInternals19
} from '../internals.js';

/** Provides the canonical fragment value. */
export const Fragment = REACT_FRAGMENT_TYPE;
/** Provides the canonical strict mode value. */
export const StrictMode = REACT_STRICT_MODE_TYPE;
/** Provides the canonical profiler value. */
export const Profiler = REACT_PROFILER_TYPE;
/** Provides the canonical suspense value. */
export const Suspense = REACT_SUSPENSE_TYPE;
/** Provides the canonical activity value. */
export const Activity = REACT_ACTIVITY_TYPE;
/** Provides the canonical view transition value. */
export const ViewTransition = Symbol.for('react.view_transition');
/** Provides the canonical version value. */
export const version = '19.2.0-exact';
/** Provides the canonical secret internals do not use or you will be fired value. */
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactSharedInternals18;
/** Provides the canonical client internals do not use or warn users they cannot upgrade value. */
export const __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
	ReactSharedInternals19;
// React's server condition exposes a smaller view (H, A, stack bookkeeping).
// Keeping it on the same target singleton is intentional: a package graph must
// never acquire a second dispatcher merely because it crossed an export condition.
/** Provides the canonical server internals do not use or warn users they cannot upgrade value. */
export const __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
	ReactSharedInternals19;

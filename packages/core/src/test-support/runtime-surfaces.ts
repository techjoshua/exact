// Raw framework test fixtures intentionally bypass application compilation. Install the same
// authored surfaces that compiled modules select individually so renderer contract tests exercise
// component behavior without making production runtime entries universal.
import '../runtime/contexts.js';
import '../runtime/component-reactivity.js';
import '../runtime/component-tasks.js';
import '../runtime/lifecycle.js';
import '../runtime/lists.js';
import '../runtime/localization.js';
import '../runtime/logging.js';
import '../runtime/refs.js';

// Compiler integration fixtures also load generated artifacts through Node package resolution,
// outside Vite's source module graph. Install the surfaces in that built-package realm as well.
import '@exactjs/core/runtime/contexts';
import '@exactjs/core/runtime/component-reactivity';
import '@exactjs/core/runtime/component-tasks';
import '@exactjs/core/runtime/lifecycle';
import '@exactjs/core/runtime/lists';
import '@exactjs/core/runtime/localization';
import '@exactjs/core/runtime/logging';
import '@exactjs/core/runtime/refs';

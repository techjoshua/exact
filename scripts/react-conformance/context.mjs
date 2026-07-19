import path from 'node:path';

/** Absolute repository root used by conformance subprocesses and fixture lookups. */
export const root = process.cwd();

/** Scratch directory that receives reproducible conformance traces. */
export const outputDirectory = path.join(root, '.tmp', 'react-conformance');

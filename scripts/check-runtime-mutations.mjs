import path from 'node:path';
import { verifyRuntimeMutations } from './runtime-mutation-witness.mjs';
await verifyRuntimeMutations(path.resolve(import.meta.dirname, '..'));

import { checkSourceArchitecture } from './source-architecture.mjs';
import { checkSourceDependencies } from './source-dependencies.mjs';
await checkSourceArchitecture(process.cwd());
await checkSourceDependencies(process.cwd());
console.log('source architecture and dependency direction ok');

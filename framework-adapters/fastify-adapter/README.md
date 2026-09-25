# @exactjs/fastify-adapter

Fastify route handler for eXact server endpoints.

## Usage

```ts
import Fastify from 'fastify';
import { createExactFastifyHandler } from '@exactjs/fastify-adapter';

const app = Fastify();
app.post('/__exact', createExactFastifyHandler(exactRuntime));
```

Fastify should parse JSON bodies before the handler runs. The adapter forwards request metadata and
the parsed payload to the shared `@exactjs/server` runtime. Response work remains live after the
request body finishes. An aborted upload or closed response cancels it. An explicitly supplied own
`request.signal` is also honored; Fastify's native body-lifetime signal does not govern response work.

[Documentation](https://techjoshua.github.io/exact/#/runtimes) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/framework-adapters/fastify-adapter)

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
the parsed payload to the shared `@exactjs/server` runtime.

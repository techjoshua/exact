# @exactjs/node-adapter

Low-level Node `http` adapter for eXact server endpoints.

## Usage

```ts
import { createServer } from 'node:http';
import { createExactNodeHandler } from '@exactjs/node-adapter';

const exact = createExactNodeHandler(exactRuntime);
createServer(exact).listen(3000);
```

Use this package with `http.createServer()` or beneath a custom Node server. It normalizes Node
request and response objects; protocol validation and dispatch remain in `@exactjs/server`.

# @exactjs/node-adapter

Node `http` adapter for eXact. Use it when you are wiring eXact directly into `http.createServer()` or need a low-level Node fallback beneath a custom server.

```ts
import { createServer } from 'node:http';
import { createExactNodeHandler } from '@exactjs/node-adapter';

const exact = createExactNodeHandler(exactRuntime);

createServer((request, response) => {
	exact(request, response);
}).listen(3000);
```

The adapter only normalizes Node's request/response objects. All eXact protocol validation and server action dispatch remains centralized in `@exactjs/server`.

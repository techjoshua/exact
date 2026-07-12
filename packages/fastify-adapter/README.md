# @exact/fastify-adapter

Fastify route handler for eXact server endpoints.

```ts
import Fastify from "fastify";
import { createExactFastifyHandler } from "@exact/fastify-adapter";

const app = Fastify();
app.post("/__exact", createExactFastifyHandler(exactRuntime));
```

Fastify should parse JSON bodies before the handler runs. The adapter forwards `request.body`, headers, method, and URL into the centralized `@exact/server` protocol handler.

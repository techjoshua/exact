# @exactjs/serverless-adapter

Generic serverless adapter for eXact endpoints. The default shape matches AWS Lambda/API Gateway style events with string bodies.

```ts
import { createExactServerlessHandler } from '@exactjs/serverless-adapter';

export const handler = createExactServerlessHandler(exactRuntime);
```

The adapter decodes base64 request bodies, forwards the request into `@exactjs/server`, and converts the result back into `{ statusCode, headers, body }`. Streaming eXact responses are collected into a text body because most basic serverless gateway integrations do not expose a Web stream response.

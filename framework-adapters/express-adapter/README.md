# @exact/express-adapter

Express middleware for eXact server endpoints.

```ts
import express from 'express';
import { createExactExpressMiddleware } from '@exact/express-adapter';

const app = express();
app.use(express.json());
app.post('/__exact', createExactExpressMiddleware(exactRuntime));
```

Mount the middleware at the same endpoint configured in your eXact server manifest. The adapter accepts `request.body` when body parsing has already run, or `request.text()` when provided by a compatible wrapper.

# @exactjs/serverless-adapter

Generic serverless adapter for eXact endpoints.

## Usage

```ts
import { createExactServerlessHandler } from '@exactjs/serverless-adapter';

export const handler = createExactServerlessHandler(exactRuntime);
```

The default contract matches AWS Lambda and API Gateway style events. It decodes text or base64
request bodies and returns `{ statusCode, headers, body }`. Streaming eXact responses are
collected because basic gateway integrations do not expose Web streams.

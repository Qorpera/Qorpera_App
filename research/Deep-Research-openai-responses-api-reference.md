# OpenAI Responses API — Complete Technical Reference

**Researched:** 2026-03-20
**Prompt:** Research the OpenAI Responses API (successor to Chat Completions API) — endpoint structure, request/response format, built-in tools (web search, code interpreter, file search), function calling differences, streaming, pricing, migration guide, and gotchas. Planning a migration from Chat Completions to Responses API for native web search.

## Key Findings

- **New endpoint** `POST /v1/responses` replaces `/v1/chat/completions`. Request model changes from `messages` array to `instructions` (system) + `input` (user), response from `choices[0].message.content` to `output_text` or `output[]` array.
- **Built-in web search** via `{ type: "web_search" }` in tools array — model decides when to search, results fed back automatically, no manual tool-call handling needed. Supports domain filtering (`filters.allowed_domains`, max 100). Each search call is billed as a **fixed 8,000 input token block** regardless of actual content retrieved.
- **Multi-turn conversations simplified**: use `store: true` + `previous_response_id` instead of accumulating message history client-side. The API handles context retrieval automatically.
- **Structured output** uses `text.format` with `json_schema` instead of `response_format`. Streaming uses semantic event types (e.g., `response.output_text.delta`) instead of raw content deltas.
- **Known gotchas**: responses can return `status: "incomplete"` even with high `max_output_tokens`; `previous_response_id` broken on Azure (use full message arrays); reasoning models may perform multiple searches per request (multiplied cost); early 2026 reports of endpoint flakiness.

## Full Research

### 1. Endpoint Structure

**Endpoint:** `POST https://api.openai.com/v1/responses`

Replaces: `POST https://api.openai.com/v1/chat/completions`

---

### 2. Request/Response Format — Differences from Chat Completions

#### Request Format

**Chat Completions (old):**
```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are helpful." },
    { "role": "user", "content": "Hello" }
  ]
}
```

**Responses API (new):**
```json
{
  "model": "gpt-5.2",
  "instructions": "You are helpful.",
  "input": "Hello"
}
```

#### Key Parameter Changes

| Chat Completions | Responses API |
|---|---|
| `messages` array | `input` (string or array of message objects) |
| `{ "role": "system" }` in messages | `instructions` (top-level parameter) |
| `response_format` | `text.format` with `json_schema` |
| Manual message history | `store: true` + `previous_response_id` |
| `response.choices[0].message.content` | `response.output_text` or `response.output[]` |

#### Response Object

| Field | Description |
|---|---|
| `id` | Unique response identifier |
| `created_at` | Timestamp |
| `model` | Model used |
| `status` | `completed`, `incomplete`, or `in_progress` |
| `output` | Array of items (messages, tool calls, etc.) |
| `output_text` | Plain text output (convenience field) |

---

### 3. Built-in Tools

The Responses API includes three hosted tools that work automatically:

#### Web Search

- **Type**: `{ type: "web_search" }`
- Model decides when to search; results are fed back into context automatically
- No manual tool call handling needed — the API handles search execution internally
- **Non-reasoning models**: immediately pass query to web search, return top results
- **Reasoning models**: actively manage search process — can perform multiple searches, analyze results, decide whether to search again (slower but more thorough)

#### Code Interpreter

- **Type**: `{ type: "code_interpreter" }`
- Runs Python code in sandboxed environment
- Can execute code, generate plots, process files
- Configuration: `container: { type: "auto", file_ids: [...] }` to reuse containers
- **Cost**: $0.03 per container execution

#### File Search

- **Type**: `{ type: "file_search" }`
- Semantic and keyword search over uploaded documents
- Creates vector stores, chunks documents, retrieves relevant sections
- Requires vector store setup with uploaded files
- **Cost**: $0.10/GB of vector storage per day + $2.50 per 1,000 tool calls

---

### 4. Web Search — Detailed Usage

#### Basic Web Search

```typescript
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await client.responses.create({
  model: 'gpt-5.2',
  input: 'Who is the current president of France?',
  tools: [{ type: 'web_search' }]
});

console.log(response.output_text);
```

#### Domain Filtering

```typescript
const response = await client.responses.create({
  model: 'gpt-5.2',
  input: 'Latest AI news',
  tools: [{
    type: 'web_search',
    filters: {
      allowed_domains: ['openai.com', 'arxiv.org', 'github.com']
    }
  }]
});
```

#### Parameters

| Parameter | Type | Description |
|---|---|---|
| `type` | string | Always `"web_search"` |
| `filters.allowed_domains` | string[] (max 100) | Domain allow-list. Omit http/https prefix (use `openai.com` not `https://openai.com`). Includes subdomains automatically. |
| `external_web_access` | boolean | Default: `true` (live). Set to `false` for cache-only/offline mode. |

#### Retrieving Sources

```typescript
const response = await client.responses.create({
  model: 'gpt-5.2',
  input: 'Query',
  tools: [{ type: 'web_search' }]
});

// response.sources contains full list of URLs consulted (not just cited ones)
```

---

### 5. Pricing

#### Web Search

- **Per-call charge**: 8,000 input tokens per web search call (fixed block, billed regardless of actual content retrieved)
- **Tool call billing**: $2.50 per 1,000 tool calls
- Standard per-model pricing applies to output tokens
- Reasoning models may perform multiple searches per request — costs multiply accordingly

#### Other Tools

- **Code Interpreter**: $0.03 per container
- **File Search**: $0.10/GB storage/day + $2.50 per 1K calls

---

### 6. Streaming

#### Enabling Streaming

```typescript
const stream = await client.responses.create({
  model: 'gpt-5.2',
  input: 'Say "Hello" ten times',
  stream: true,
});

for await (const event of stream) {
  console.log(event);
}
```

#### Stream Event Types

The Responses API uses semantic events (type-safe), replacing raw content deltas:

| Event | Description |
|---|---|
| `ResponseCreatedEvent` | Response initialized |
| `ResponseInProgressEvent` | Processing continues |
| `ResponseContentPartAdded` | New content chunk starts |
| `ResponseContentPartDone` | Content chunk complete |
| `ResponseOutputTextDelta` | Text content arrived (word-by-word) |
| `ResponseFunctionCallArgumentsDelta` | Function arguments streaming |
| `ResponseOutputTextAnnotationAdded` | Citations/annotations added |
| `ResponseCompletedEvent` | Final status — success |
| `ResponseFailedEvent` | Final status — failure with reason |

#### Processing Stream Events

```typescript
for await (const event of stream) {
  if (event.type === 'response.content_part.delta') {
    process.stdout.write(event.delta?.text || '');
  }
  if (event.type === 'response.output_item.done') {
    console.log('Item complete:', event.item);
  }
  if (event.type === 'response.done') {
    console.log('Final status:', event.response.status);
  }
}
```

Structured JSON outputs also stream incrementally (not all-at-once).

---

### 7. Function Calling — Responses vs Chat Completions

#### Chat Completions Flow (old)

```
1. Send tools array + messages
2. Model returns tool_calls in response
3. You execute tool manually
4. You send back tool results with role: "tool"
5. Model generates final response
```

#### Responses API Flow (new)

```
1. Send tools array + input
2. Built-in tools execute automatically
3. Custom functions: model calls them; you handle in output
4. Model continues reasoning with results
5. Final response includes everything
```

#### Custom Function Definition

```typescript
const response = await client.responses.create({
  model: 'gpt-5.2',
  input: 'What is 25 * 4?',
  tools: [{
    type: 'function',
    function: {
      name: 'multiply',
      description: 'Multiply two numbers',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' }
        },
        required: ['a', 'b']
      }
    }
  }]
});

// Check output for tool calls
response.output.forEach(item => {
  if (item.type === 'function_call') {
    console.log('Function:', item.function.name);
    console.log('Args:', item.function.arguments);
  }
});
```

**Key difference**: Built-in tools (web_search, code_interpreter, file_search) execute automatically. Custom function calls appear in `output` and require you to submit results via a separate API call or next request.

---

### 8. Migration Guide: Chat Completions to Responses API

#### Step 1: Update Endpoint

```typescript
// OLD
const response = await client.chat.completions.create({...});

// NEW
const response = await client.responses.create({...});
```

#### Step 2: Convert Messages to Instructions + Input

```typescript
// OLD
messages: [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello' }
]

// NEW
instructions: 'You are a helpful assistant.',
input: 'Hello'
```

#### Step 3: Multi-turn Conversations

Use `store: true` and `previous_response_id` instead of accumulating message history:

```typescript
// First request
const response1 = await client.responses.create({
  model: 'gpt-5.2',
  input: 'Hello, what is 2+2?',
  store: true,
});

// Second request — API automatically retrieves prior context
const response2 = await client.responses.create({
  model: 'gpt-5.2',
  input: 'What about 3+3?',
  previous_response_id: response1.id,
  store: true,
});
```

#### Step 4: Add Built-in Tools

```typescript
tools: [
  { type: 'web_search' },
  { type: 'function', function: { name: 'my_func', ... } }
]
```

#### Step 5: Update Response Handling

```typescript
// OLD
response.choices[0].message.content

// NEW
response.output_text // convenience field
// or iterate:
response.output.forEach(item => {
  if (item.type === 'message') {
    console.log(item.content[0].text);
  }
  if (item.type === 'function_call') {
    // Handle custom tool calls
  }
});
```

#### Step 6: Update Streaming

```typescript
// OLD: message chunks with role/content_delta
// NEW: semantic events
for await (const event of stream) {
  if (event.type === 'response.output_text.delta') {
    process.stdout.write(event.delta.text || '');
  }
}
```

#### Step 7: Update Structured Output

```typescript
// OLD
response_format: { type: 'json_object' }

// NEW
text: {
  format: {
    type: 'json_schema',
    name: 'response_shape',
    schema: { ... },
    strict: true
  }
}
```

---

### 9. Known Limitations and Gotchas

1. **Incomplete responses with `max_output_tokens`**: Even with high values (25000+), responses may return `status: "incomplete"` with `reason: "max_output_tokens"`. Monitor the `status` field and implement retry logic.

2. **Azure OpenAI multi-turn bug**: Azure deployments fail on multi-turn with HTTP 400 "Item not found — store is set to false". The `store` parameter and `previous_response_id` only work on `api.openai.com`, not Azure URLs. Workaround: use full message arrays instead of `previous_response_id` on Azure.

3. **Web search cost amplification**: Fixed 8,000 tokens per search call is billed regardless of actual search content retrieved. Reasoning models may perform multiple searches per request, multiplying costs. Budget accordingly.

4. **Endpoint stability**: Early 2026 reports of endpoint flakiness and cutoff responses. Implement exponential backoff + retry logic in production.

5. **No `response_format` parameter**: Must use `text.format` instead for structured outputs.

6. **Sequential tool execution only**: No parallel tool calling — tools execute sequentially.

7. **API key requirement**: Responses API requires explicit API key authentication. No OAuth tokens from third-party providers.

---

### 10. Complete Code Examples (Node.js/TypeScript)

#### Web Search with Domain Filtering

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function answerQuestion(question: string) {
  const response = await client.responses.create({
    model: 'gpt-5.2',
    instructions: 'You are a helpful research assistant. Provide accurate, sourced answers.',
    input: question,
    tools: [{
      type: 'web_search',
      filters: {
        allowed_domains: ['openai.com', 'arxiv.org']
      }
    }],
  });

  console.log('Answer:', response.output_text);
  console.log('Sources:', response.sources);
  return response;
}
```

#### Multi-turn Conversation

```typescript
async function multiTurnChat() {
  const response1 = await client.responses.create({
    model: 'gpt-5.2',
    instructions: 'You are a math tutor.',
    input: 'Solve 2x + 5 = 15',
    store: true,
  });
  console.log('Turn 1:', response1.output_text);

  const response2 = await client.responses.create({
    model: 'gpt-5.2',
    input: 'Now solve 3x - 2 = 10',
    previous_response_id: response1.id,
    store: true,
  });
  console.log('Turn 2:', response2.output_text);
}
```

#### Streaming with Events

```typescript
async function streamingResponse(input: string) {
  const stream = await client.responses.create({
    model: 'gpt-5.2',
    input,
    stream: true,
  });

  for await (const event of stream) {
    switch (event.type) {
      case 'response.output_text.delta':
        process.stdout.write(event.delta?.text || '');
        break;
      case 'response.done':
        console.log('\n\nResponse completed with status:', event.response.status);
        break;
      case 'response.failed':
        console.error('Response failed:', event.error);
        break;
    }
  }
}
```

#### Structured Output with JSON Schema

```typescript
const response = await client.responses.create({
  model: 'gpt-5.2',
  input: 'Extract structured data: "John is 30 years old and works in sales"',
  text: {
    format: {
      type: 'json_schema',
      name: 'person_info',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          department: { type: 'string' },
        },
        required: ['name', 'age', 'department'],
      },
      strict: true,
    }
  }
});

const data = JSON.parse(response.output_text);
console.log(data); // { name: 'John', age: 30, department: 'sales' }
```

#### Error Handling with Retries

```typescript
async function robustResponseCall(input: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.responses.create({
        model: 'gpt-5.2',
        input,
      });

      if (response.status === 'completed') {
        return response;
      } else if (response.status === 'incomplete') {
        console.warn('Response incomplete, retrying...');
      }
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

---

### Migration Checklist

- [ ] Update endpoint from `/chat/completions` to `/responses`
- [ ] Replace `messages` with `instructions` + `input`
- [ ] For multi-turn, use `store: true` + `previous_response_id` (not message history)
- [ ] Update response parsing: `output_text` or iterate `output[]`
- [ ] Update streaming: switch to semantic events
- [ ] Add `{ type: "web_search" }` to tools array for live data
- [ ] Replace `response_format` with `text.format`
- [ ] Test `status` field handling (watch for `incomplete`)
- [ ] Budget for web search token costs (8K per call)
- [ ] Implement retry logic with exponential backoff

## Sources

- [Migrate to the Responses API](https://platform.openai.com/docs/guides/migrate-to-responses) — OpenAI official migration guide
- [OpenAI Responses API vs Chat Completions](https://platform.openai.com/docs/guides/responses-vs-chat-completions) — Feature comparison
- [Web search tool documentation](https://platform.openai.com/docs/guides/tools-web-search) — Web search parameters, pricing, behavior
- [Responses API tools overview](https://platform.openai.com/docs/guides/tools) — Built-in tools reference
- [Code interpreter tool](https://platform.openai.com/docs/guides/tools-code-interpreter) — Sandboxed Python execution
- [File search tool](https://platform.openai.com/docs/guides/tools-file-search) — Vector search over uploaded documents
- [Function calling guide](https://developers.openai.com/api/docs/guides/function-calling) — Custom function definitions
- [Streaming API responses](https://developers.openai.com/api/docs/guides/streaming-responses) — Semantic event types
- [OpenAI Node.js SDK](https://github.com/openai/openai-node) — TypeScript SDK reference
- [Conversation state and multi-turn](https://platform.openai.com/docs/guides/conversation-state) — `store` + `previous_response_id`
- [Pricing - OpenAI API](https://developers.openai.com/api/docs/pricing) — Token costs, tool pricing
- [OpenAI Cookbook - Responses API](https://cookbook.openai.com/examples/responses_api/responses_example) — Code examples
- [Medium: OpenAI Responses API for TypeScript](https://blog.robino.dev/posts/openai-responses-api) — Community tutorial
- [DataCamp: OpenAI Responses API Guide](https://www.datacamp.com/tutorial/openai-responses-api) — Tutorial with examples

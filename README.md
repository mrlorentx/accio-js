# Accio-JS

A modern, lightweight HTTP client for Node.js with built-in retry capabilities, timeout handling, and event monitoring. Built on top of Node's native fetch (via undici).

[![Node.js Version](https://img.shields.io/node/v/accio-js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

## Features

- 🔄 Automatic retries with exponential backoff
- ⏱️ Request timeout support
- 🎯 Configurable retry conditions
- 🎲 Jitter for distributed systems
- 📊 Event-based monitoring
- 💪 Full TypeScript support
- 🪶 Lightweight with minimal dependencies

## Quick Start
```typescript
import { createHttpClient } from 'accio-js';

const client = createHttpClient();

try {
  const response = await client.get('https://jsonplaceholder.typicode.com/todos/1');
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error('Request failed:', error);
}
```

## Configuration

```typescript
const client = createHttpClient({
  // Default headers for all requests
  headers: {
    'Authorization': 'Bearer token',
  },
  
  // Request timeout in milliseconds
  timeout: 5000,
  
  // Retry configuration
  retry: {
    maxRetries: 3,
    initialDelay: 100,
    maxDelay: 1000,
    jitter: 0.1,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
    shouldRetry: (error, attempt) => true,
  }
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headers` | `Record<string, string>` | `{}` | Default headers for all requests |
| `timeout` | `number` | `undefined` | Request timeout in milliseconds |
| `retry.maxRetries` | `number` | `3` | Maximum number of retry attempts |
| `retry.initialDelay` | `number` | `100` | Initial delay between retries (ms) |
| `retry.maxDelay` | `number` | `1000` | Maximum delay between retries (ms) |
| `retry.jitter` | `number` | `0.1` | Random delay factor (0-1) |
| `retry.retryableStatuses` | `number[]` | `[408, 429, 500, 502, 503, 504]` | HTTP status codes that trigger retries |
| `retry.shouldRetry`| `(error, attempt) => boolean`| `() => true` | Custom retry function. Return `true` to retry for `retryableStatuses` using your own logic |

## Event Monitoring

Monitor request lifecycle events:

```typescript
client.on('request:start', (url, init) => {
  console.log(`Starting request to ${url}`);
});

client.on('request:end', (url, response, duration) => {
  console.log(`Request completed in ${duration}ms`);
});

client.on('request:error', (url, error, attempt) => {
  console.error(`Request failed (attempt ${attempt}):`, error);
});

client.on('request:retry', (url, error, attempt) => {
  console.log(`Retrying request (attempt ${attempt})`);
});
```

## API Reference

### HTTP Methods

- `client.get(url, init?)`
- `client.post(url, init?)`
- `client.put(url, init?)`
- `client.delete(url, init?)`
- `client.patch(url, init?)`
- `client.fetch(url, init?)` - Direct fetch with full request options

All methods return a `Promise<Response>` compatible with the Fetch API.

### Events

- `request:start` - Emitted when a request begins
- `request:end` - Emitted when a request successfully completes
- `request:error` - Emitted when a request fails
- `request:retry` - Emitted before a retry attempt

## Cookbook & Examples

### Using with Hono
See [Hono example README](examples/hono/README.md)

### Using with Express

```typescript
import express from 'express';
import { createHttpClient } from 'accio-js';

const app = express();

// Create a shared HTTP client
const httpClient = createHttpClient({
  timeout: 3000,
  retry: {
    maxRetries: 2,
  },
});

// Add client to Express request object
app.use((req, res, next) => {
  req.httpClient = httpClient;
  next();
});

// Use in route handlers
app.get('/api/users', async (req, res) => {
  try {
    const response = await req.httpClient.get('https://api.example.com/users');
    const users = await response.json();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.listen(3000);
```
### Pushing metrics on events

```typescript
import { createHttpClient } from 'accio-js';
import { metrics } from 'datadog-metrics';

// Configure Datadog
metrics.init({ host: 'myapp', prefix: 'http.' });

const client = createHttpClient();

// Track request durations
client.on('request:end', (url, response, duration) => {
  const urlPath = new URL(url).pathname;
  metrics.histogram('request.duration', duration, {
    path: urlPath,
    status: response.status.toString(),
  });
});

// Track errors
client.on('request:error', (url, error) => {
  const urlPath = new URL(url).pathname;
  metrics.increment('request.error', 1, {
    path: urlPath,
    error: error.name,
  });
});

// Track retries
client.on('request:retry', (url, error, attempt) => {
  const urlPath = new URL(url).pathname;
  metrics.increment('request.retry', 1, {
    path: urlPath,
    attempt: attempt.toString(),
  });
});
```
## Todos

- Implement cookbook examples


# Retrieve

A modern, lightweight HTTP client for Node.js with built-in retry capabilities, timeout handling, and event monitoring. Built on top of Node's native fetch (via undici).

[![Node.js Version](https://img.shields.io/node/v/retrieve)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

## Features

- 🔄 Automatic retries with exponential backoff
- ⏱️ Request timeout support
- 🎯 Configurable retry conditions
- 🎲 Jitter for distributed systems
- 📊 Event-based monitoring
- 💪 Full TypeScript support
- 🪶 Lightweight with minimal dependencies

## Installation
```bash
npm install retrieve
```

## Quick Start

```typescript
import { createHttpClient } from 'retrieve';

// Create a client with default configuration
const client = createHttpClient();

// Make a request
try {
  const response = await client.get('https://api.example.com/data');
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


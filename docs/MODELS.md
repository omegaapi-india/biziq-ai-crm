# Model adapters

BizIQ uses a single adapter interface in `lib/model.js`. It supports three modes and never requires a paid API.

## Rules engine

Default mode. `extractLead()` in `lib/extract.js` performs deterministic extraction and scoring. It works with no network access and no API key. This is what the public capture form uses unless a model is explicitly selected in AI Studio.

## Local model bridge

`bridge/ollama-bridge.js` is a small Node.js HTTP server:

- binds only to `127.0.0.1:8789`
- accepts `POST /extract` with `{ prompt, model }`
- calls `http://127.0.0.1:11434/api/generate` by default
- expects JSON output from the local model
- stores nothing and uses no API key

Start it with:

```bash
npm run bridge
```

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BIZIQ_BRIDGE_PORT` | `8789` | Local bridge port |
| `OLLAMA_MODEL` | `llama3.2` | Model name |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Local Ollama endpoint |

In AI Studio, choose **Local model bridge (Ollama)**. The server first returns a redacted prompt, the browser calls the local bridge, then the structured result is merged back into the deterministic extractor. If the bridge is not running, the UI shows a clear error and the rules engine remains available.

## Cloud model (BYOK)

Choose **Cloud model (BYOK)** and provide:

- `baseUrl`: a public HTTPS OpenAI-compatible endpoint
- `model`: the model identifier
- `apiKey`: your own key

Validation rules:

- HTTPS is required.
- Private, loopback, `.local`, `.internal`, and `.localhost` hosts are rejected.
- Credentials in the URL are rejected.
- The key must be at least 8 characters.
- The model name must be non-empty and at most 80 characters.

The key is sent only in the `Authorization` header for that request. It is not written to D1, logs, Markdown, or source files. The UI clears the key field after each request.

The prompt is built from a redacted copy of the message: email addresses and phone-like numbers are replaced with `[email]` and `[number]`.

## Adding another provider

Any provider that exposes an OpenAI-compatible `/chat/completions` endpoint can be used. For a different response shape, add a small parser in `lib/model.js` and keep the same `validateModelConfig()` and `publicModelConfig()` contracts. Never log the raw config object.

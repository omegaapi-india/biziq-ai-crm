# API reference

All API responses use `Cache-Control: no-store`. Admin routes require the signed `biziq_admin` cookie.

## Public routes

### `POST /api/capture`

Captures one lead.

```json
{
  "message": "My name is Rohan Kumar from Netra Studio. We need pricing this week at rohan@example.com.",
  "source": "website",
  "website": "",
  "startedAt": 1760000000000,
  "modelConfig": { "provider": "rules" }
}
```

`website` is a honeypot. `startedAt` blocks instant form bots. `modelConfig` is optional; cloud configs are proxied for one request only.

Response:

```json
{
  "ok": true,
  "id": "uuid",
  "score": 86,
  "intent": "pricing",
  "nextAction": "Send a short pricing sheet",
  "model": "rules"
}
```

### `GET /api/health`

Returns service metadata. No authentication required.

### `POST /api/admin/login`

```json
{ "password": "owner-password" }
```

Sets the signed admin session cookie on success.

### `POST /api/admin/logout`

Clears the admin cookie.

### `GET /api/admin/me`

Returns `{ "ok": true, "signedIn": true|false }`.

## Admin routes

### `GET /api/leads?q=&limit=100`

Returns `{ ok, count, leads }`. Each lead includes parsed `tags`.

### `GET /api/leads/:id`

Returns one lead.

### `PATCH /api/leads/:id`

```json
{
  "status": "qualified",
  "note": "Spoke to founder. Send pricing.",
  "nextAction": "Send proposal on Friday"
}
```

### `DELETE /api/leads/:id`

Removes one lead and its related activity, outcome, and model-run records. Writes a cleanup activity entry.

### `GET /api/activities?leadId=&limit=120`

Returns the bot activity timeline, newest first.

### `POST /api/outcomes`

```json
{
  "leadId": "uuid",
  "result": "won",
  "revenue": 50000,
  "note": "Signed annual plan"
}
```

Updates the lead, writes the outcome, and adjusts the adaptive weights.

### `POST /api/bot/run`

Reviews active leads, flags hot or stale ones, and writes activity records. It never sends messages.

### `GET /api/stats`

Returns lead totals, intent mix, seven-day trend, wins, revenue, and current learning weights.

### `POST /api/ai/extract`

```json
{
  "message": "Paste an enquiry here.",
  "modelConfig": { "provider": "rules" },
  "refinement": "{\"name\":\"Rohan\"}"
}
```

Rules mode returns `{ ok, lead, model }`. Local mode returns `{ ok, needsBrowserBridge: true, prompt, model }`. Cloud mode returns the structured lead after proxying the request with the supplied key.

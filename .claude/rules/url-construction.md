# SDK URL Construction

## No Trailing Slashes Before Query Params

API URLs must never have a trailing `/` before `?`:

```javascript
// WRONG — creates /memory/decisions/?limit=25
return this.api.get(`/memory/decisions/${qs ? '?' + qs : ''}`);

// CORRECT — creates /memory/decisions?limit=25
return this.api.get(`/memory/decisions${qs ? '?' + qs : ''}`);
```

## Pattern

When building URLs with optional query params, use this pattern:

```javascript
async list(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return this.api.get(`/memory/endpoint${qs ? '?' + qs : ''}`);
}
```

Note: no `/` between the path and `${qs}`.

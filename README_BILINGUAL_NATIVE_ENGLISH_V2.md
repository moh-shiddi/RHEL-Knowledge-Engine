# RHEL Knowledge Engine — Arabic and Native English

## Pages

- `index.html`: Arabic interface (RTL)
- `en.html`: English interface (LTR)

## Correct language architecture

The English interface does **not** translate the Arabic DOM after rendering.
It loads dedicated English code and data directly:

- `app-en.js`
- `intent-engine-en.js`
- `doctor-engine-en.js`
- `workflow-engine-en.js`
- `execution-diagnostics-en.js`
- `knowledge-en.json`
- `intents-en.json`
- `doctor-data-en.json`
- `diagnostic-patterns-en.json`

This prevents mixed-language text and repeated fallback labels.

## Local test

```bash
python -m http.server 8000
```

- Arabic: `http://localhost:8000/`
- English: `http://localhost:8000/en.html`

## Deployment

Upload all files together. Cloudflare Pages should publish from the repository
root unless a different output directory is configured.

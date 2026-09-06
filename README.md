# P2P Quick Transfer

A lightweight browser app for sharing text, images, and files together through one four-digit pickup code. No account is required. Shares expire automatically after two hours.

## Features

- One composer for text, images, and arbitrary file attachments
- Type, paste with Ctrl+V, drag files in, or choose files manually
- Up to 20,000 text characters and 20 attachments totaling 200 MiB per share
- Image thumbnails, file names and sizes, and per-attachment removal
- Large uploads use 16 MiB chunks, show progress, and retry transient failures
- Four-digit pickup codes with support for previously created text, file, and image shares
- Optional burn-after-reading: text-only shares are removed after retrieval; shares with attachments are removed after all attachments have been downloaded (image previews do not trigger deletion)
- Local filesystem persistence, expired-share cleanup, and cleanup of unfinished upload sessions
- Responsive layout with a locally hosted mountain photograph background

## Transfer architecture

Despite the product name, this implementation uses server-backed HTTPS upload and download, not WebRTC peer-to-peer transfer. Browsers upload content to the Node.js service through a reverse proxy, and recipients download the stored content using a pickup code. The sender can close the page once the upload finishes. There is no application-level end-to-end encryption.

Shares of up to 32 MiB use a multipart upload. Larger shares use upload sessions with 16 MiB chunks, assembled on the server after all expected bytes have arrived. This keeps each upload request below common proxy request-size limits. Incomplete upload sessions expire after two hours.

## Run locally

```bash
npm install
npm test
npm start
```

Open <http://localhost:3000>.

Optional environment variables:

- `PORT`: HTTP port; defaults to `3000`.
- `DATA_DIR`: runtime storage directory; defaults to `./data`.
- `SHARE_TTL_MS`: share lifetime in milliseconds; defaults to two hours.

Runtime data is written under `data/` and is excluded from Git, including uploaded files and unfinished upload sessions. Local deployment backups under `deploy/backups/` are also excluded.

## Docker

```bash
docker compose up -d --build
```

The container listens on `127.0.0.1:3300` for a local reverse proxy. The included Nginx template allows 210 MiB request bodies, leaving room for multipart overhead. Uploaded files and share metadata persist in the Docker volume `app-data`.

After deployment, run a self-cleaning production smoke test with:

```bash
npm run smoke -- https://your-domain.example
```

## Project status and attribution

This is an unofficial study project. Its initial public-page layout was rebuilt from the publicly accessible [123share.cn](https://123share.cn/) interface. It is not affiliated with or endorsed by that service. The server implementation in this repository is an independent clean-room implementation based on the browser-visible request and response contract; no original server source, administrator interface, production data, or user uploads are included.

The original site states that its website design, code, logo, and brand belong to its operator. This repository removes the original logo, filing number, blog content, browser extension, mini-program assets, analytics, and original production data. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled dependencies and attribution.

No project-wide open-source license is asserted for material derived from the reference interface. Review the applicable rights before reuse or redistribution.

## 🔗 Friend Links

- 🐧 [LINUX DO — 新的理想型社区](https://linux.do/)

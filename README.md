# P2P Quick Transfer

A lightweight browser app for sharing text, files, and multiple images through four-digit pickup codes. No account is required. Shares expire automatically after two hours and can optionally be destroyed after their first retrieval.

## Features

- Text sharing up to 20,000 characters
- Single-file sharing up to 100 MiB
- Multi-image sharing: up to 20 images and 100 MiB total
- Four-digit pickup codes
- Burn-after-reading support
- Local filesystem persistence and automatic cleanup
- Responsive browser interface

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

Runtime data is written under `data/` and is excluded from Git.

## Project status and attribution

This is an unofficial study project. Its initial public-page layout was rebuilt from the publicly accessible [123share.cn](https://123share.cn/) interface. It is not affiliated with or endorsed by that service. The server implementation in this repository is an independent clean-room implementation based on the browser-visible request and response contract; no original server source, administrator interface, production data, or user uploads are included.

The original site states that its website design, code, logo, and brand belong to its operator. This repository removes the original logo, filing number, blog content, browser extension, mini-program assets, analytics, and original production data. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled dependencies and attribution.

No project-wide open-source license is asserted for material derived from the reference interface. Review the applicable rights before reuse or redistribution.

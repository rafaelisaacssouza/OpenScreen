# OpenScreen

A simple, open-source screen sharing application designed for quick and easy screen sharing — straight from the browser, no install required.

The host picks a screen, window or tab and gets an **access IP** (e.g. `172.38.205.14`). Viewers enter it, ask to join, and only see anything after the host approves them. Video travels **peer-to-peer** between browsers; the web server only serves the pages.

> The interface is in Brazilian Portuguese.

## Features

- Share a screen, window or tab with audio (where the browser supports it)
- Access IP in IPv4 format, or a direct link (`/view/172-38-205-14`)
- **Host approval** — every viewer must be accepted before any video is sent
- **Viewer limit** and **maximum session length**, enabled by default
- Host can remove a viewer at any time
- Viewer: fullscreen, unmute, clear states (waiting, rejected, full, ended)
- Responsive layout; viewing works on mobile

## Safety by default

These limits are on unless the operator explicitly changes them:

| Variable | Default | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_REQUIRE_APPROVAL` | `true` | Host approves each viewer before any video is sent |
| `NEXT_PUBLIC_MAX_VIEWERS` | `3` | Simultaneous viewers per session |
| `NEXT_PUBLIC_MAX_SESSION_MINUTES` | `60` | Session ends automatically after this time |

The goal is a tool for *showing your screen to someone*, not a livestreaming platform. Raising these limits changes the nature — and the risk profile — of your deployment.

## How it works

```
Host browser                                Viewer browser
   │  getDisplayMedia()                           │
   │  registers peer id "openscreen-v1-<ip>"      │
   │◄──────── data connection + name ─────────────│  (signaling via PeerJS)
   │  host approves                               │
   │───────── media call (screen stream) ────────►│  (WebRTC, P2P, encrypted)
```

1. **Capture** — `navigator.mediaDevices.getDisplayMedia()` (requires HTTPS).
2. **Signaling** — [PeerJS](https://peerjs.com) exchanges SDP/ICE. Serverless hosts such as Vercel can't keep WebSockets open, so a PeerServer handles this (the free public one by default).
3. **Approval** — the viewer opens a *data* connection carrying their name. Nothing else happens until the host accepts.
4. **Stream** — on approval, the host calls the viewer with the screen stream. WebRTC media is always encrypted (DTLS-SRTP).

### Why P2P

No media server to pay for or scale, lower latency, and the operator never stores or relays screen content.

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Screen capture works on `localhost` and HTTPS only.

## Deploying

The project is a standard Next.js app — deploy it to Vercel, Netlify, or any Node host.

For production, configure (see `.env.example`):

- **TURN server** — strongly recommended. With STUN only, connections fail on many mobile, corporate and symmetric-NAT networks. Metered.ca and Cloudflare offer free tiers, or run your own `coturn`.
- **Own PeerServer** (optional) — the public PeerJS server is free but occasionally unstable. You can [self-host one](https://github.com/peers/peerjs-server).

## Browser support

| | Share | View |
| --- | --- | --- |
| Chrome / Edge (desktop) | ✅ | ✅ |
| Firefox (desktop) | ✅ | ✅ |
| Safari (desktop) | ✅ | ✅ |
| iOS / Android | ❌ | ✅ |

Mobile browsers don't expose `getDisplayMedia`, so phones can watch but not share.

## Responsibility of operators

This repository provides **source code only**. The author does not operate any public instance of OpenScreen.

If you deploy OpenScreen and make it available to others, **you are the operator of that service** and are solely responsible for complying with the laws that apply to you — including, where relevant, child online-safety rules, data-protection law, and record-keeping obligations. In Brazil this includes the ECA Digital (Lei 15.211/2025), the LGPD (Lei 13.709/2018) and the Marco Civil da Internet (Lei 12.965/2014). Public deployments will typically need, at a minimum, terms of use, a privacy policy, age assurance appropriate to the risk, a way to report abuse, and a channel for authorities.

Do not use OpenScreen to share content you don't have the rights to.

## Tech stack

Next.js (App Router) · React · TypeScript · PeerJS · WebRTC

## License

[MIT](./LICENSE) — provided "as is", without warranty of any kind.

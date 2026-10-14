# OpenScreen

A simple, open-source screen sharing application designed for quick and easy screen sharing — straight from the browser, no install required.

The host creates a **room** and gets an **access IP** (e.g. `172.38.205.14`). Others enter it, ask to join, and get in only after the host approves them. Inside, it works like a video call for screens: **anyone can share their screen (or not)**, and each person picks which shared screen to watch. Video travels **peer-to-peer** between browsers; the web server only serves the pages.

> The interface is in Brazilian Portuguese.

## Features

- Rooms where any participant can share a screen, window or tab — sharing is optional
- Each person chooses which screen is in the spotlight and can switch at any time; sharers can swap what they share without leaving
- **Echo-free audio by default** — only a browser tab's audio is captured, so Discord/WhatsApp calls aren't sent back to the people in them (see below)
- Access IP in IPv4 format, or a direct link (`/view/172-38-205-14`)
- **Host approval** — every participant must be accepted before seeing the room
- **Participant limit** and **maximum session length**, enabled by default
- Host can remove a participant at any time; closing the room ends it for everyone
- Responsive layout; joining and watching work on mobile

## Safety by default

These limits are on unless the operator explicitly changes them:

| Variable | Default | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_REQUIRE_APPROVAL` | `true` | Host approves each participant before they enter the room |
| `NEXT_PUBLIC_MAX_GUESTS` | `3` | Participants per room besides the host (`NEXT_PUBLIC_MAX_VIEWERS` is still read as a fallback) |
| `NEXT_PUBLIC_MAX_SESSION_MINUTES` | `60` | Room closes automatically after this time |

The goal is a tool for *showing your screen to someone*, not a livestreaming platform. Raising these limits changes the nature — and the risk profile — of your deployment.

## Audio without echo

Sharing the *whole system's* audio includes the voice of whoever you're talking to on Discord, WhatsApp, etc. — and they hear themselves back. So by default OpenScreen asks the browser for **tab audio only** (`systemAudio: "exclude"`): to send sound, share a browser tab (e.g. a video) and tick "Share tab audio". Call apps are never captured.

Sharers can still choose "System audio" (with a warning) or "No audio". OpenScreen also asks the browser not to capture the sound the OpenScreen page itself plays (`restrictOwnAudio`), so other participants' screen audio isn't sent back into the room. Audio capture is a Chromium feature (Chrome, Edge); Firefox and Safari share video only.

## How it works

```
Host browser (room hub)                     Guest browser
   │  registers peer id "openscreen-v1-<ip>"      │
   │◄──────── data connection + name ─────────────│  (signaling via PeerJS)
   │  host approves                               │
   │───────── participant list ──────────────────►│  re-sent to everyone on every change

Any participant who shares ──── media call ────► every other participant  (WebRTC, P2P, encrypted)
```

1. **Room** — the host's browser registers the access IP and keeps the participant list: who is in the room and who is sharing.
2. **Approval** — a guest opens a *data* connection carrying their name. They see nothing until the host accepts.
3. **Sharing** — `navigator.mediaDevices.getDisplayMedia()` (requires HTTPS). The sharer calls every other participant directly (a full mesh). Swapping the screen re-calls everyone with the new one.
4. **Signaling** — [PeerJS](https://peerjs.com) exchanges SDP/ICE. Serverless hosts such as Vercel can't keep WebSockets open, so a PeerServer handles this (the free public one by default). WebRTC media is always encrypted (DTLS-SRTP).

Because it's a mesh, each sharer uploads one copy of their screen per participant. That's fine for small rooms (4 people by default); bigger rooms would need a media server (SFU).

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

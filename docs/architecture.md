# Architecture

## Components

| Part | Tech | Role |
|---|---|---|
| `client/` | React, Vite, Capacitor | iOS app: dock UI, pairing, touchpad, settings |
| `server/src` | Node, Express, Socket.io | Auth, dock layout, command execution, HTTP routes |
| `server/helper` | C# (.NET, WinForms) | Native Windows work: audio, brightness, media session, clipboard, screenshots, app icons, UWP apps |
| `desktop/` | C# (.NET, WebView2) | Tray app: starts the server, shows address and PIN, manages trusted devices |

## Data flow

```
tap -> client (Socket.io event) -> server/socket.js -> executor -> platform layer
                                                                   |-> helper exe (stdin/stdout, JSON lines)
                                                                   |-> PowerShell input script (mouse, keyboard)
```

- The server only accepts events after `AUTH_RESULT.ok`. See [protocol.md](protocol.md).
- The platform layer (`server/src/platform`) hides Windows details. With `LOCALDOCK_DEV=1` a fake implementation is used, so the whole stack runs on Linux and macOS for tests.
- The helper speaks base64 encoded JSON lines on stdin and stdout. It is built once with `dotnet build` and reused. A compiled helper replaced an earlier PowerShell worker that antivirus products flagged.

## Pairing and trust

1. Client connects, server sends `PIN_REQ`.
2. Client sends the 6 digit PIN. Five wrong tries lock the source IP for a while.
3. Server returns a random token. Only its SHA-256 hash is stored in `%APPDATA%\LocalDock\trusted.json`.
4. The client reconnects with the token. Tokens can be revoked from the tray panel.

## Desktop panel

The panel is served at `http://localhost:3000/panel`. It is accepted only from the loopback address with a localhost `Host` and `Origin`, and state changing calls need a custom header. A phone on the network cannot read the PIN from it.

## Data locations

| What | Where |
|---|---|
| Trusted token hashes, dock layout | `%APPDATA%\LocalDock` |
| Files sent from the phone | `Downloads\LocalDock` |
| Screenshots and signatures | `Pictures\LocalDock` |
| Phone settings (theme, scene) | On the phone only |

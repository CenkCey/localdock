# Security

## Model

LocalDock lets a paired phone control a PC: launch programs, type, move the mouse, read the clipboard, take screenshots and power the machine off. Treat a paired phone like a logged in keyboard.

- **Local network only.** The server listens on port 3000 of the PC. Do not forward this port to the internet and do not run it on untrusted networks.
- **PIN pairing.** A random 6 digit PIN is shown on the PC. Five wrong attempts lock the source IP temporarily.
- **Tokens.** After pairing the phone keeps a random token. The PC stores only its SHA-256 hash.
- **Revocation.** *Revoke all* in the tray panel removes every trusted device and disconnects them.
- **Panel is local.** The panel at `/panel` answers only to loopback requests with a localhost `Host` and `Origin`, and state changing calls require a custom header, so other devices and web pages cannot read the PIN or revoke devices.
- **File access.** Downloads for the phone need a per connection key. Uploads land in `Downloads\LocalDock`.
- **No telemetry.** Nothing leaves your network.

## Known limits

- Traffic on the LAN is not encrypted (plain HTTP and WebSocket). Anyone who can sniff your Wi-Fi can read it. Use a trusted network with WPA2/WPA3.
- The helper executable is built locally and is not code signed.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's *Report a vulnerability* button under the Security tab of this repository. Include steps to reproduce and the affected version.

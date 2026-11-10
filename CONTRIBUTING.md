# Contributing

Thanks for helping. Small, focused pull requests are easiest to review.

## Setup

```bash
cd server && npm install
cd ../client && npm install
```

You do not need Windows or a phone to work on most things. `LOCALDOCK_DEV=1` runs the server with fake data on any OS, and `npm run fake` in `client` starts a fake server for UI work.

## Before you open a pull request

```bash
cd server && npm test
cd ../client && npm test && npm run build
cd .. && node test/e2e.mjs
```

For Windows code, also build the helper and tray app:

```bat
dotnet build server\helper\LocalDock.Helper.csproj -c Release
dotnet build desktop\LocalDock.Desktop.csproj -c Release
```

## Guidelines

- Keep the protocol in [docs/protocol.md](docs/protocol.md) in sync with both server and client.
- Add or update tests for behavior changes.
- Never commit PINs, tokens, logs, personal paths, signing teams or provisioning files.
- Match the style of the surrounding code.

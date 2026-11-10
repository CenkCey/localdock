# Windows setup

## Requirements

- Windows 10 or 11
- Node.js 18 or newer
- .NET SDK 10 (builds the helper and tray app)

## Tray app (recommended)

```bat
cd server
npm install
cd ..\desktop
build-desktop.bat
```

This builds `server\helper\bin\LocalDock.Helper.exe` and `desktop\bin\LocalDock.exe`, then starts the app. The app lives in the system tray. Right click it for *Open panel*, *Stop/Restart server*, *Start with Windows* and *Exit*. Exiting stops the server.

Build errors are written to `server\helper\build.log` and `desktop\build.log`.

## Console only

```bat
server\start-server.bat
server\stop-server.bat
```

The console prints the address and PIN.

## Firewall

On first start Windows asks whether Node.js may accept connections. Allow **private networks**. If you missed the prompt, add an inbound rule for TCP port 3000 on the Private profile.

## Environment variables

| Variable | Meaning |
|---|---|
| `PORT` | Server port, default 3000 |
| `LOCALDOCK_PIN` | Fixed 6 digit PIN instead of a random one (testing) |
| `LOCALDOCK_DATA` | Data directory |
| `LOCALDOCK_DEV` | `1` runs with fake data on any OS |
| `LOCALDOCK_NOPANEL` | `1` does not open the panel in a browser |

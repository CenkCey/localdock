# Troubleshooting

**The phone says "Not found" for my PC**
Same Wi-Fi? Guest networks often isolate devices from each other. Check the address in the PC panel and try it in the phone browser: `http://ADDRESS/hello` should return a small JSON.

**Connection times out**
Windows Firewall blocks Node.js. Allow it on the Private profile, and make sure the network is not marked Public.

**Wrong PIN, then locked**
Five wrong tries lock the source for a short time. Wait and retry. The PIN is shown in the panel.

**Volume, media or screenshots do nothing**
The helper did not build. Read `server\helper\build.log`. Make sure `dotnet --list-sdks` shows version 10.

**Antivirus flags the helper**
The helper is built locally from the sources in `server/helper`, but it is not code signed. Review the sources and add an exclusion for the `server\helper\bin` folder if you trust them.

**The tray panel shows an error**
Run `desktop\build-desktop.bat` again, which also stops old processes. The server log is `server\server-desktop.log`.

**Apps are missing in the app list**
Open Menu, then Apps, and tap the rescan button. Store apps are listed from the Start menu.

**iPhone shows a local network error**
Settings, Privacy and Security, Local Network, enable LocalDock.

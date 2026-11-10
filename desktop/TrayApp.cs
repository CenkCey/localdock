namespace LocalDock.Desktop;

sealed class TrayApp : ApplicationContext
{
    static readonly string PanelUrl = $"http://localhost:{ServerHost.Port}/panel";
    readonly Control ui = new();
    readonly NotifyIcon notify = new();
    readonly Icon onIcon = IconFactory.Create(true);
    readonly Icon offIcon = IconFactory.Create(false);
    readonly PanelForm panel;
    readonly ToolStripMenuItem openItem = new(Loc.S("Open panel", "Paneli aç"));
    readonly ToolStripMenuItem toggleItem = new(Loc.S("Stop server", "Sunucuyu durdur"));
    readonly ToolStripMenuItem restartItem = new(Loc.S("Restart server", "Sunucuyu yeniden başlat"));
    readonly ToolStripMenuItem autoItem = new(Loc.S("Start with Windows", "Windows ile başlat"));
    readonly ToolStripMenuItem exitItem = new(Loc.S("Exit", "Çık"));
    readonly System.Windows.Forms.Timer timer = new() { Interval = 3000 };
    ServerHost? host;
    bool online;
    bool busy;
    string status = "";

    public TrayApp(EventWaitHandle showEvent, bool minimized)
    {
        _ = ui.Handle;
        panel = new PanelForm(onIcon);

        openItem.Font = new Font(openItem.Font, FontStyle.Bold);
        openItem.Click += async (_, _) => await ShowPanelAsync();
        toggleItem.Click += async (_, _) => await ToggleAsync();
        restartItem.Click += async (_, _) => await RestartAsync();
        autoItem.Checked = Autostart.Enabled;
        autoItem.Click += (_, _) =>
        {
            Autostart.Set(!Autostart.Enabled);
            autoItem.Checked = Autostart.Enabled;
        };
        exitItem.Click += async (_, _) => await ExitAsync();

        var menu = new ContextMenuStrip();
        menu.Items.AddRange(new ToolStripItem[]
        {
            openItem,
            new ToolStripSeparator(),
            toggleItem,
            restartItem,
            new ToolStripSeparator(),
            autoItem,
            new ToolStripSeparator(),
            exitItem
        });

        notify.Icon = offIcon;
        notify.Text = "LocalDock";
        notify.ContextMenuStrip = menu;
        notify.MouseClick += async (_, e) =>
        {
            if (e.Button == MouseButtons.Left) await ShowPanelAsync();
        };
        notify.Visible = true;

        ThreadPool.RegisterWaitForSingleObject(showEvent, (_, _) => ui.BeginInvoke(new Action(async () => await ShowPanelAsync())), null, -1, false);

        timer.Tick += async (_, _) => await RefreshAsync();
        timer.Start();

        ui.BeginInvoke(new Action(async () => await InitAsync(minimized)));
    }

    async Task InitAsync(bool minimized)
    {
        var dir = ServerHost.FindServerDir();
        if (dir == null)
        {
            MessageBox.Show(Loc.S("The server folder was not found. LocalDock.exe must stay inside desktop\\bin of the project folder.", "server klasörü bulunamadı. LocalDock.exe, proje klasörünün içindeki desktop\\bin altında olmalı."), "LocalDock", MessageBoxButtons.OK, MessageBoxIcon.Error);
            ExitThread();
            return;
        }
        host = new ServerHost(dir);
        var error = await StartServerAsync();
        if (error != null)
        {
            notify.ShowBalloonTip(5000, "LocalDock", Loc.S("The server did not start", "Sunucu başlamadı"), ToolTipIcon.Error);
            await panel.OpenAsync(PanelUrl, error);
            return;
        }
        if (!minimized) await panel.OpenAsync(PanelUrl, null);
    }

    async Task<string?> StartServerAsync()
    {
        if (host == null || busy) return null;
        busy = true;
        try
        {
            var error = await host.StartAsync(s =>
            {
                status = s;
                notify.Text = $"LocalDock · {s}";
            });
            status = "";
            await RefreshAsync();
            return error;
        }
        finally
        {
            busy = false;
        }
    }

    async Task StopServerAsync()
    {
        if (host == null || busy) return;
        busy = true;
        try
        {
            await host.StopAsync();
            await RefreshAsync();
        }
        finally
        {
            busy = false;
        }
    }

    async Task ToggleAsync()
    {
        if (online)
        {
            await StopServerAsync();
            return;
        }
        var error = await StartServerAsync();
        if (error != null) await panel.OpenAsync(PanelUrl, error);
    }

    async Task RestartAsync()
    {
        await StopServerAsync();
        var error = await StartServerAsync();
        if (error != null) await panel.OpenAsync(PanelUrl, error);
    }

    async Task ShowPanelAsync()
    {
        var up = await ServerHost.IsUpAsync();
        await panel.OpenAsync(PanelUrl, up ? null : Loc.S("The server is not running. Right-click the tray icon to start it.", "Sunucu çalışmıyor. Tepsi simgesine sağ tıklayıp sunucuyu başlatabilirsin."));
    }

    async Task RefreshAsync()
    {
        var up = await ServerHost.IsUpAsync();
        if (up != online || notify.Icon == null)
        {
            online = up;
            notify.Icon = up ? onIcon : offIcon;
            toggleItem.Text = up ? Loc.S("Stop server", "Sunucuyu durdur") : Loc.S("Start server", "Sunucuyu başlat");
        }
        if (status.Length == 0) notify.Text = up ? Loc.S("LocalDock · running", "LocalDock · çalışıyor") : Loc.S("LocalDock · stopped", "LocalDock · durdu");
        restartItem.Enabled = host != null && !busy;
        toggleItem.Enabled = host != null && !busy;
        if (up && panel.Visible && panel.ShowingError) await panel.OpenAsync(PanelUrl, null);
    }

    async Task ExitAsync()
    {
        timer.Stop();
        notify.Visible = false;
        if (host != null) await host.StopAsync();
        notify.Dispose();
        onIcon.Dispose();
        offIcon.Dispose();
        ExitThread();
    }
}

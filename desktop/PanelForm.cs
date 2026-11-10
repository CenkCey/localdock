using System.Diagnostics;
using System.Net;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LocalDock.Desktop;

sealed class PanelForm : Form
{
    static readonly Color Back = Color.FromArgb(228, 231, 223);
    readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Back };
    bool ready;
    bool failed;

    public PanelForm(Icon icon)
    {
        Text = "LocalDock";
        Icon = icon;
        ClientSize = new Size(520, 760);
        MinimumSize = new Size(420, 560);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Back;
        Controls.Add(web);
    }

    public bool ShowingError { get; private set; }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
        }
        base.OnFormClosing(e);
    }

    async Task EnsureReadyAsync()
    {
        if (ready || failed) return;
        try
        {
            var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LocalDock", "webview");
            var env = await CoreWebView2Environment.CreateAsync(null, folder);
            await web.EnsureCoreWebView2Async(env);
            var s = web.CoreWebView2.Settings;
            s.AreDefaultContextMenusEnabled = false;
            s.AreDevToolsEnabled = false;
            s.IsStatusBarEnabled = false;
            s.IsZoomControlEnabled = false;
            web.CoreWebView2.NewWindowRequested += (_, e) => e.Handled = true;
            ready = true;
        }
        catch
        {
            failed = true;
        }
    }

    public async Task OpenAsync(string url, string? error)
    {
        await EnsureReadyAsync();
        if (!ready)
        {
            if (error == null) Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            return;
        }

        if (error != null)
        {
            web.NavigateToString(ErrorHtml(error));
            ShowingError = true;
        }
        else if (ShowingError || web.Source == null || web.Source.AbsoluteUri == "about:blank")
        {
            web.CoreWebView2.Navigate(url);
            ShowingError = false;
        }

        if (!Visible) Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Activate();
    }

    static string ErrorHtml(string message)
    {
        var safe = WebUtility.HtmlEncode(message);
        return "<body style=\"font-family:Segoe UI,sans-serif;background:#e4e7df;color:#171a16;padding:32px\">" +
               "<h3 style=\"margin:0 0 12px\">LocalDock</h3><p style=\"line-height:1.5\">" + safe + "</p></body>";
    }
}

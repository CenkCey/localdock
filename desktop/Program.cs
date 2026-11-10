namespace LocalDock.Desktop;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        using var mutex = new Mutex(true, "LocalDock.Desktop.Single", out var created);
        using var showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, "LocalDock.Desktop.Show");
        if (!created)
        {
            showEvent.Set();
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApp(showEvent, args.Contains("--minimized")));
    }
}

using System.Diagnostics;
using System.Text;

namespace LocalDock.Desktop;

sealed class ServerHost
{
    public const int Port = 3000;
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(2) };
    readonly string dir;
    readonly object logLock = new();
    Process? proc;
    StreamWriter? log;

    public ServerHost(string dir)
    {
        this.dir = dir;
    }

    public string LogPath => Path.Combine(dir, "server-desktop.log");

    public static string? FindServerDir()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current != null)
        {
            var candidate = Path.Combine(current.FullName, "server");
            if (File.Exists(Path.Combine(candidate, "src", "index.js"))) return candidate;
            current = current.Parent;
        }
        return null;
    }

    public static async Task<bool> IsUpAsync()
    {
        try
        {
            var body = await Http.GetStringAsync($"http://127.0.0.1:{Port}/hello");
            return body.Contains("localdock");
        }
        catch
        {
            return false;
        }
    }

    public async Task<string?> StartAsync(Action<string>? status = null)
    {
        if (await IsUpAsync()) return null;

        if (!await Task.Run(() => Run("cmd", "/c where node", 8000)))
            return Loc.S("Node.js was not found. Install Node 18 or newer from nodejs.org.", "Node.js bulunamadı. nodejs.org adresinden Node 18 veya üstünü kur.");

        if (!Directory.Exists(Path.Combine(dir, "node_modules")))
        {
            status?.Invoke(Loc.S("Installing dependencies", "Bağımlılıklar kuruluyor"));
            if (!await Task.Run(() => Run("cmd", "/c npm install --omit=dev", 600000)))
                return Loc.S("npm install failed.", "npm install başarısız oldu.");
        }

        if (!File.Exists(Path.Combine(dir, "helper", "bin", "LocalDock.Helper.exe")))
        {
            status?.Invoke(Loc.S("Building the helper", "Yardımcı derleniyor"));
            if (!await Task.Run(() => Run("cmd", "/c build-helper.bat", 300000)))
                return Loc.S("The helper could not be built. Details: server\\helper\\build.log", "Yardımcı derlenemedi. Ayrıntı: server\\helper\\build.log");
        }

        var psi = new ProcessStartInfo("node", "src/index.js")
        {
            WorkingDirectory = dir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
        psi.Environment["LOCALDOCK_NOPANEL"] = "1";

        try
        {
            log?.Dispose();
            log = new StreamWriter(new FileStream(LogPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite), new UTF8Encoding(false)) { AutoFlush = true };
        }
        catch
        {
            log = null;
        }

        Process? p;
        try
        {
            p = Process.Start(psi);
        }
        catch (Exception e)
        {
            return Loc.S($"The server could not be started: {e.Message}", $"Sunucu başlatılamadı: {e.Message}");
        }
        if (p == null) return Loc.S("The server could not be started.", "Sunucu başlatılamadı.");

        proc = p;
        p.OutputDataReceived += (_, e) => Write(e.Data);
        p.ErrorDataReceived += (_, e) => Write(e.Data);
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();

        for (var i = 0; i < 80; i++)
        {
            if (p.HasExited) return Loc.S($"The server exited (code {p.ExitCode}). Details: server\\server-desktop.log", $"Sunucu kapandı (kod {p.ExitCode}). Ayrıntı: server\\server-desktop.log");
            if (await IsUpAsync()) return null;
            await Task.Delay(500);
        }
        return Loc.S("The server did not start within 40 seconds. Details: server\\server-desktop.log", "Sunucu 40 saniyede başlamadı. Ayrıntı: server\\server-desktop.log");
    }

    public async Task StopAsync()
    {
        await Task.Run(() =>
        {
            try
            {
                if (proc is { HasExited: false }) proc.Kill(true);
            }
            catch
            {
            }
            KillByPort();
        });
        for (var i = 0; i < 20; i++)
        {
            if (!await IsUpAsync()) break;
            await Task.Delay(250);
        }
        lock (logLock)
        {
            try
            {
                log?.Dispose();
            }
            catch
            {
            }
            log = null;
        }
        proc = null;
    }

    void Write(string? line)
    {
        if (line == null) return;
        lock (logLock)
        {
            try
            {
                log?.WriteLine(line);
            }
            catch
            {
            }
        }
    }

    bool Run(string file, string args, int timeoutMs)
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo(file, args)
            {
                WorkingDirectory = dir,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            });
            if (p == null) return false;
            p.OutputDataReceived += (_, _) => { };
            p.ErrorDataReceived += (_, _) => { };
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            if (!p.WaitForExit(timeoutMs))
            {
                p.Kill(true);
                return false;
            }
            return p.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    static void KillByPort()
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo("netstat", "-ano -p tcp")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true
            });
            if (p == null) return;
            var text = p.StandardOutput.ReadToEnd();
            p.WaitForExit(5000);
            foreach (var raw in text.Split('\n'))
            {
                var parts = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 5) continue;
                if (!parts[1].EndsWith($":{Port}")) continue;
                if (!parts[2].EndsWith(":0")) continue;
                if (!int.TryParse(parts[^1].Trim(), out var pid) || pid <= 4) continue;
                try
                {
                    Process.GetProcessById(pid).Kill(true);
                }
                catch
                {
                }
            }
        }
        catch
        {
        }
    }
}

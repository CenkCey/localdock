using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Reflection;
using System.Text;
using System.Xml.Linq;
using Windows.Management.Deployment;

namespace LocalDock.Helper;

internal static class UwpOps
{
    public static Dictionary<string, object?> LinkTargets(List<string> paths)
    {
        var result = new Dictionary<string, object?>();
        Type? type = Type.GetTypeFromProgID("WScript.Shell");
        object? shell = type == null ? null : Activator.CreateInstance(type);
        foreach (string path in paths)
        {
            string target = "";
            try
            {
                if (type != null && shell != null)
                {
                    object? link = type.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
                    if (link != null)
                    {
                        target = link.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, link, null) as string ?? "";
                    }
                }
            }
            catch (Exception)
            {
                target = "";
            }
            result[path] = target;
        }
        return result;
    }

    private static List<(string Name, string Id)> StartApps()
    {
        var list = new List<(string, string)>();
        var psi = new ProcessStartInfo("powershell.exe")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            StandardOutputEncoding = Encoding.UTF8
        };
        psi.ArgumentList.Add("-NoProfile");
        psi.ArgumentList.Add("-NonInteractive");
        psi.ArgumentList.Add("-Command");
        psi.ArgumentList.Add("[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-StartApps | ForEach-Object { $_.Name + [char]9 + $_.AppID }");
        using Process? p = Process.Start(psi);
        if (p == null) return list;
        string text = p.StandardOutput.ReadToEnd();
        p.WaitForExit(30000);
        foreach (string raw in text.Split('\n'))
        {
            string line = raw.TrimEnd('\r');
            int tab = line.IndexOf('\t');
            if (tab <= 0) continue;
            list.Add((line.Substring(0, tab), line.Substring(tab + 1).Trim()));
        }
        return list;
    }

    private static Dictionary<string, string> Packages()
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var manager = new PackageManager();
            foreach (var pkg in manager.FindPackagesForUser(""))
            {
                try
                {
                    string family = pkg.Id.FamilyName;
                    string path = pkg.InstalledPath;
                    if (!string.IsNullOrEmpty(family) && !string.IsNullOrEmpty(path)) map[family] = path;
                }
                catch (Exception)
                {
                }
            }
        }
        catch (Exception)
        {
        }
        return map;
    }

    private static string? FindLogo(string root, string rel)
    {
        try
        {
            string full = Path.Combine(root, rel.Replace('/', '\\'));
            string? dir = Path.GetDirectoryName(full);
            if (dir == null || !Directory.Exists(dir)) return null;
            string baseName = Path.GetFileNameWithoutExtension(full);
            return new DirectoryInfo(dir)
                .GetFiles(baseName + "*.png")
                .Where(f => !f.Name.Contains("contrast", StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(f => f.Length)
                .Select(f => f.FullName)
                .FirstOrDefault();
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static string Attr(XElement? el, string name)
    {
        return el?.Attribute(name)?.Value ?? "";
    }

    public static List<Dictionary<string, object?>> Apps()
    {
        var output = new List<Dictionary<string, object?>>();
        var packages = Packages();
        foreach (var (name, id) in StartApps())
        {
            int bang = id.IndexOf('!');
            if (bang <= 0) continue;
            string family = id.Substring(0, bang);
            string appId = id.Substring(bang + 1);
            if (!packages.TryGetValue(family, out string? root)) continue;
            string? logo = null;
            string bg = "";
            try
            {
                XDocument doc = XDocument.Load(Path.Combine(root, "AppxManifest.xml"));
                XElement? app = doc.Descendants().FirstOrDefault(e => e.Name.LocalName == "Application" && Attr(e, "Id") == appId);
                XElement? visual = app?.Elements().FirstOrDefault(e => e.Name.LocalName == "VisualElements");
                string rel = Attr(visual, "Square150x150Logo");
                if (rel.Length == 0) rel = Attr(visual, "Square44x44Logo");
                bg = Attr(visual, "BackgroundColor");
                if (rel.Length > 0) logo = FindLogo(root, rel);
            }
            catch (Exception)
            {
                logo = null;
            }
            if (logo == null) continue;
            output.Add(new Dictionary<string, object?>
            {
                ["name"] = name,
                ["id"] = id,
                ["logo"] = logo,
                ["bg"] = bg
            });
        }
        return output;
    }

    public static void SavePlated(string src, string output, string bg)
    {
        using Image image = Image.FromFile(src);
        using var target = new Bitmap(96, 96, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(target))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.Clear(Color.Transparent);
            Color color = Color.FromArgb(255, 43, 47, 54);
            if (bg.Length == 7 && bg[0] == '#')
            {
                try
                {
                    color = ColorTranslator.FromHtml(bg);
                }
                catch (Exception)
                {
                }
            }
            const int d = 44;
            using var path = new GraphicsPath();
            path.AddArc(0, 0, d, d, 180, 90);
            path.AddArc(96 - d, 0, d, d, 270, 90);
            path.AddArc(96 - d, 96 - d, d, d, 0, 90);
            path.AddArc(0, 96 - d, d, d, 90, 90);
            path.CloseFigure();
            using var brush = new SolidBrush(color);
            g.FillPath(brush, path);
            g.DrawImage(image, 14, 14, 68, 68);
        }
        target.Save(output, ImageFormat.Png);
    }
}

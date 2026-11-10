using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Reflection;
using System.Runtime.InteropServices;

namespace LocalDock.Desktop;

static class IconFactory
{
    [DllImport("user32.dll")]
    static extern bool DestroyIcon(IntPtr handle);

    public static Icon Create(bool online)
    {
        var size = SystemInformation.SmallIconSize;
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.ico")!;
        var icon = new Icon(stream, size);
        if (online) return icon;
        using (icon)
        {
            return Dim(icon);
        }
    }

    static Icon Dim(Icon source)
    {
        using var original = source.ToBitmap();
        using var gray = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(gray))
        {
            var matrix = new ColorMatrix(new[]
            {
                new[] { 0.30f, 0.30f, 0.30f, 0f, 0f },
                new[] { 0.59f, 0.59f, 0.59f, 0f, 0f },
                new[] { 0.11f, 0.11f, 0.11f, 0f, 0f },
                new[] { 0f, 0f, 0f, 0.55f, 0f },
                new[] { 0f, 0f, 0f, 0f, 1f }
            });
            using var attrs = new ImageAttributes();
            attrs.SetColorMatrix(matrix);
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.DrawImage(original, new Rectangle(0, 0, gray.Width, gray.Height), 0, 0, original.Width, original.Height, GraphicsUnit.Pixel, attrs);
        }
        var handle = gray.GetHicon();
        try
        {
            using var temp = Icon.FromHandle(handle);
            return (Icon)temp.Clone();
        }
        finally
        {
            DestroyIcon(handle);
        }
    }
}

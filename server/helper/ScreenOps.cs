using System.Drawing.Imaging;

namespace LocalDock.Helper;

internal static class ScreenOps
{
    public static string? Capture(string path)
    {
        Rectangle bounds = SystemInformation.VirtualScreen;
        using var bitmap = new Bitmap(bounds.Width, bounds.Height);
        using (Graphics g = Graphics.FromImage(bitmap))
        {
            g.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bitmap.Size);
        }
        bitmap.Save(path, ImageFormat.Png);
        return JpegTools.Thumb(bitmap, 480);
    }
}

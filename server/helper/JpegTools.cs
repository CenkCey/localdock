using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace LocalDock.Helper;

internal static class JpegTools
{
    private const int MaxBytes = 40000;

    private static byte[] Encode(Image image, int width, int height, int quality)
    {
        using var bitmap = new Bitmap(width, height);
        using (Graphics g = Graphics.FromImage(bitmap))
        {
            g.Clear(Color.White);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.DrawImage(image, 0, 0, width, height);
        }
        ImageCodecInfo? codec = null;
        foreach (ImageCodecInfo candidate in ImageCodecInfo.GetImageEncoders())
        {
            if (candidate.MimeType == "image/jpeg")
            {
                codec = candidate;
                break;
            }
        }
        if (codec == null) throw new InvalidOperationException("jpeg encoder unavailable");
        using var parameters = new EncoderParameters(1);
        parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);
        using var stream = new MemoryStream();
        bitmap.Save(stream, codec, parameters);
        return stream.ToArray();
    }

    public static string? Thumb(Image image, int maxSide)
    {
        double scale = Math.Min(1.0, (double)maxSide / Math.Max(image.Width, image.Height));
        int w = Math.Max(1, (int)(image.Width * scale));
        int h = Math.Max(1, (int)(image.Height * scale));
        foreach (int quality in new[] { 75, 55, 40 })
        {
            byte[] bytes = Encode(image, w, h, quality);
            if (bytes.Length <= MaxBytes) return Convert.ToBase64String(bytes);
        }
        byte[] small = Encode(image, Math.Max(1, w / 2), Math.Max(1, h / 2), 40);
        if (small.Length <= MaxBytes) return Convert.ToBase64String(small);
        return null;
    }
}

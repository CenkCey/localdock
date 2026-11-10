namespace LocalDock.Helper;

internal static class ClipboardOps
{
    public static string? GetText()
    {
        if (Clipboard.ContainsText()) return Clipboard.GetText();
        return null;
    }

    public static void SetText(string text)
    {
        Clipboard.SetDataObject(text, true, 5, 100);
    }

    public static void SetImage(string path)
    {
        byte[] bytes = File.ReadAllBytes(path);
        using var imageStream = new MemoryStream(bytes);
        using var image = System.Drawing.Image.FromStream(imageStream);
        var pngStream = new MemoryStream(bytes);
        var data = new DataObject();
        data.SetImage(image);
        try
        {
            data.SetData("PNG", false, pngStream);
        }
        catch (Exception)
        {
        }
        Clipboard.SetDataObject(data, true, 5, 100);
    }
}

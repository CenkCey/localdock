namespace LocalDock.Helper;

internal sealed class CommandHandler
{
    private readonly MediaService media = new MediaService();

    public void Initialize()
    {
        media.Initialize();
    }

    public object? Execute(Request req)
    {
        switch (req.Cmd)
        {
            case "vol_get":
                return new Dictionary<string, object?>
                {
                    ["volume"] = Audio.GetVolume(),
                    ["muted"] = Audio.GetMute()
                };
            case "vol_set":
                {
                    int v = Math.Clamp(req.Int("value"), 0, 100);
                    Audio.SetVolume(v);
                    if (v > 0) Audio.SetMute(false);
                    return true;
                }
            case "bri_get":
                return Brightness.Get();
            case "bri_set":
                Brightness.Set(Math.Clamp(req.Int("value"), 0, 100));
                return true;
            case "media_ok":
                return media.Available;
            case "media":
                return media.GetMedia();
            case "clip_get":
                return ClipboardOps.GetText();
            case "clip_set":
                ClipboardOps.SetText(System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(req.Str("b64"))));
                return true;
            case "clip_img":
                ClipboardOps.SetImage(req.Str("path"));
                return true;
            case "shot":
                return ScreenOps.Capture(req.Str("path"));
            case "icon":
                IconOps.Save(req.Str("path"), req.Str("out"));
                return true;
            case "lnk_targets":
                return UwpOps.LinkTargets(req.StrList("paths"));
            case "uwp_apps":
                return UwpOps.Apps();
            case "icon_plated":
                UwpOps.SavePlated(req.Str("src"), req.Str("out"), req.Str("bg"));
                return true;
            default:
                throw new InvalidOperationException("unknown command");
        }
    }
}

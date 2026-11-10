using Windows.Media.Control;
using Windows.Storage.Streams;

namespace LocalDock.Helper;

internal sealed class MediaService
{
    private const int WaitMs = 8000;
    private GlobalSystemMediaTransportControlsSessionManager? manager;
    private string thumbKey = "";
    private string? thumbValue;
    private int thumbTries;

    public bool Available => manager != null;

    public void Initialize()
    {
        try
        {
            Task<GlobalSystemMediaTransportControlsSessionManager> task =
                GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask();
            if (task.Wait(WaitMs)) manager = task.Result;
        }
        catch (Exception)
        {
            manager = null;
        }
    }

    public Dictionary<string, object?>? GetMedia()
    {
        if (manager == null) return null;
        GlobalSystemMediaTransportControlsSession? session = manager.GetCurrentSession();
        if (session == null) return null;

        var playback = session.GetPlaybackInfo();
        string status = "stopped";
        if (playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing) status = "playing";
        else if (playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused) status = "paused";

        Task<GlobalSystemMediaTransportControlsSessionMediaProperties> propsTask = session.TryGetMediaPropertiesAsync().AsTask();
        if (!propsTask.Wait(WaitMs)) throw new TimeoutException("media properties timeout");
        GlobalSystemMediaTransportControlsSessionMediaProperties props = propsTask.Result;

        string title = props.Title ?? "";
        string artist = props.Artist ?? "";
        if (title.Length == 0 && artist.Length == 0) return null;

        string key = (session.SourceAppUserModelId ?? "") + "|" + title + "|" + artist;
        if (key != thumbKey)
        {
            thumbKey = key;
            thumbValue = null;
            thumbTries = 0;
        }
        if (thumbValue == null && thumbTries < 3)
        {
            thumbTries++;
            try
            {
                thumbValue = LoadThumb(props);
            }
            catch (Exception)
            {
                thumbValue = null;
            }
        }

        return new Dictionary<string, object?>
        {
            ["status"] = status,
            ["title"] = title,
            ["artist"] = artist,
            ["thumb"] = thumbValue
        };
    }

    private static string? LoadThumb(GlobalSystemMediaTransportControlsSessionMediaProperties props)
    {
        if (props.Thumbnail == null) return null;
        Task<IRandomAccessStreamWithContentType> openTask = props.Thumbnail.OpenReadAsync().AsTask();
        if (!openTask.Wait(WaitMs)) return null;
        using IRandomAccessStreamWithContentType stream = openTask.Result;
        uint size = (uint)stream.Size;
        if (size == 0) return null;
        using var reader = new DataReader(stream.GetInputStreamAt(0));
        Task<uint> loadTask = reader.LoadAsync(size).AsTask();
        if (!loadTask.Wait(WaitMs)) return null;
        var bytes = new byte[size];
        reader.ReadBytes(bytes);
        using var memory = new MemoryStream(bytes);
        using var image = System.Drawing.Image.FromStream(memory);
        return JpegTools.Thumb(image, 160);
    }
}

using System.Runtime.InteropServices;

namespace LocalDock.Helper;

internal static class Native
{
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    public static extern bool DestroyIcon(IntPtr handle);
}

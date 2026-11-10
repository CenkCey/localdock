using Microsoft.Win32;

namespace LocalDock.Desktop;

static class Autostart
{
    const string KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string ValueName = "LocalDock";

    public static bool Enabled
    {
        get
        {
            using var key = Registry.CurrentUser.OpenSubKey(KeyPath);
            return key?.GetValue(ValueName) is string;
        }
    }

    public static void Set(bool on)
    {
        using var key = Registry.CurrentUser.CreateSubKey(KeyPath);
        if (on)
        {
            key.SetValue(ValueName, $"\"{Environment.ProcessPath}\" --minimized");
        }
        else
        {
            key.DeleteValue(ValueName, false);
        }
    }
}

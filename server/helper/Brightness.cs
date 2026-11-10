using System.Management;

namespace LocalDock.Helper;

internal static class Brightness
{
    public static int? Get()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(@"root\WMI", "SELECT CurrentBrightness FROM WmiMonitorBrightness");
            using ManagementObjectCollection results = searcher.Get();
            foreach (ManagementBaseObject item in results)
            {
                using (item)
                {
                    object? value = item["CurrentBrightness"];
                    if (value == null) return null;
                    return Convert.ToInt32(value);
                }
            }
            return null;
        }
        catch (Exception)
        {
            return null;
        }
    }

    public static void Set(int value)
    {
        int count = 0;
        using var searcher = new ManagementObjectSearcher(@"root\WMI", "SELECT * FROM WmiMonitorBrightnessMethods");
        using ManagementObjectCollection results = searcher.Get();
        foreach (ManagementObject item in results)
        {
            using (item)
            {
                item.InvokeMethod("WmiSetBrightness", new object[] { (uint)1, (byte)value });
                count++;
            }
        }
        if (count == 0) throw new InvalidOperationException("no brightness control");
    }
}

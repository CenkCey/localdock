using System.Runtime.InteropServices;

namespace LocalDock.Helper;

[ComImport]
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioEndpointVolume
{
    [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int GetChannelCount(out uint count);
    [PreserveSig] int SetMasterVolumeLevel(float level, ref Guid context);
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
    [PreserveSig] int GetMasterVolumeLevel(out float level);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
    [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

[ComImport]
[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice
{
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object result);
}

[ComImport]
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator
{
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}

internal static class Audio
{
    private static readonly Guid EnumeratorClsid = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
    private static readonly Guid EndpointVolumeIid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");

    private static IAudioEndpointVolume Endpoint()
    {
        Type? type = Type.GetTypeFromCLSID(EnumeratorClsid);
        if (type == null) throw new InvalidOperationException("audio enumerator unavailable");
        object? instance = Activator.CreateInstance(type);
        if (instance == null) throw new InvalidOperationException("audio enumerator unavailable");
        var enumerator = (IMMDeviceEnumerator)instance;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out IMMDevice device));
        Guid iid = EndpointVolumeIid;
        Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out object volume));
        return (IAudioEndpointVolume)volume;
    }

    public static int GetVolume()
    {
        Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out float level));
        return (int)Math.Round(level * 100f);
    }

    public static void SetVolume(int percent)
    {
        Guid context = Guid.Empty;
        Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(percent / 100f, ref context));
    }

    public static bool GetMute()
    {
        Marshal.ThrowExceptionForHR(Endpoint().GetMute(out bool muted));
        return muted;
    }

    public static void SetMute(bool mute)
    {
        Guid context = Guid.Empty;
        Marshal.ThrowExceptionForHR(Endpoint().SetMute(mute, ref context));
    }
}

using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace LocalDock.Helper;

[ComImport]
[Guid("46EB5926-582E-4017-9FDF-E8998DAA0950")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IImageList
{
    [PreserveSig] int Add(IntPtr bitmap, IntPtr mask, out int index);
    [PreserveSig] int ReplaceIcon(int index, IntPtr icon, out int result);
    [PreserveSig] int SetOverlayImage(int image, int overlay);
    [PreserveSig] int Replace(int index, IntPtr bitmap, IntPtr mask);
    [PreserveSig] int AddMasked(IntPtr bitmap, int maskColor, out int index);
    [PreserveSig] int Draw(IntPtr parameters);
    [PreserveSig] int Remove(int index);
    [PreserveSig] int GetIcon(int index, int flags, out IntPtr icon);
}

internal static class IconOps
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEINFO
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SHGetFileInfo(string path, uint attributes, ref SHFILEINFO info, uint size, uint flags);

    [DllImport("shell32.dll", EntryPoint = "#727")]
    private static extern int SHGetImageList(int list, ref Guid riid, out IImageList imageList);

    private static IntPtr Jumbo(string path)
    {
        try
        {
            var info = new SHFILEINFO();
            IntPtr found = SHGetFileInfo(path, 0, ref info, (uint)Marshal.SizeOf<SHFILEINFO>(), 0x4000);
            if (found == IntPtr.Zero) return IntPtr.Zero;
            Guid iid = new Guid("46EB5926-582E-4017-9FDF-E8998DAA0950");
            if (SHGetImageList(4, ref iid, out IImageList list) != 0) return IntPtr.Zero;
            if (list.GetIcon(info.iIcon, 1, out IntPtr handle) != 0) return IntPtr.Zero;
            return handle;
        }
        catch (Exception)
        {
            return IntPtr.Zero;
        }
    }

    public static void Save(string path, string output)
    {
        IntPtr handle = Jumbo(path);
        Icon? icon = null;
        try
        {
            if (handle != IntPtr.Zero) icon = Icon.FromHandle(handle);
            else icon = Icon.ExtractAssociatedIcon(path);
            if (icon == null) throw new InvalidOperationException("icon unavailable");

            using Bitmap source = icon.ToBitmap();
            using var target = new Bitmap(96, 96, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(target))
            {
                g.Clear(Color.Transparent);
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(source, 0, 0, 96, 96);
            }
            target.Save(output, ImageFormat.Png);
        }
        finally
        {
            icon?.Dispose();
            if (handle != IntPtr.Zero) Native.DestroyIcon(handle);
        }
    }
}

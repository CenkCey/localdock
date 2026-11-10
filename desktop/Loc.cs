using System.Runtime.InteropServices;

namespace LocalDock.Desktop;

static class Loc
{
    [DllImport("kernel32.dll")]
    static extern ushort GetUserDefaultUILanguage();

    static readonly bool Turkish = (GetUserDefaultUILanguage() & 0x3FF) == 0x1F;

    public static string S(string en, string tr) => Turkish ? tr : en;
}

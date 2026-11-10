$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace LDIn
{
    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct INPUTUNION
    {
        [FieldOffset(0)]
        public MOUSEINPUT mi;
        [FieldOffset(0)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT
    {
        public uint type;
        public INPUTUNION u;
    }

    public static class Native
    {
        [DllImport("user32.dll", SetLastError = true)]
        static extern uint SendInput(uint count, INPUT[] inputs, int size);

        const uint MOVE = 0x0001;
        const uint WHEEL = 0x0800;
        const uint HWHEEL = 0x1000;
        const uint KEYUP = 0x0002;
        const uint EXTENDED = 0x0001;
        const uint UNICODE = 0x0004;

        static void Send(List<INPUT> list)
        {
            if (list.Count == 0) return;
            SendInput((uint)list.Count, list.ToArray(), Marshal.SizeOf(typeof(INPUT)));
        }

        static INPUT Mouse(uint flags, int dx, int dy, int data)
        {
            INPUT i = new INPUT();
            i.type = 0;
            i.u.mi.dx = dx;
            i.u.mi.dy = dy;
            i.u.mi.mouseData = unchecked((uint)data);
            i.u.mi.dwFlags = flags;
            return i;
        }

        static INPUT Key(ushort vk, ushort scan, uint flags)
        {
            INPUT i = new INPUT();
            i.type = 1;
            i.u.ki.wVk = vk;
            i.u.ki.wScan = scan;
            i.u.ki.dwFlags = flags;
            return i;
        }

        static void ButtonFlags(string button, out uint down, out uint up)
        {
            if (button == "right") { down = 0x0008; up = 0x0010; return; }
            if (button == "middle") { down = 0x0020; up = 0x0040; return; }
            down = 0x0002;
            up = 0x0004;
        }

        public static void Move(int dx, int dy)
        {
            List<INPUT> l = new List<INPUT>();
            l.Add(Mouse(MOVE, dx, dy, 0));
            Send(l);
        }

        public static void Down(string button)
        {
            uint d, u;
            ButtonFlags(button, out d, out u);
            List<INPUT> l = new List<INPUT>();
            l.Add(Mouse(d, 0, 0, 0));
            Send(l);
        }

        public static void Up(string button)
        {
            uint d, u;
            ButtonFlags(button, out d, out u);
            List<INPUT> l = new List<INPUT>();
            l.Add(Mouse(u, 0, 0, 0));
            Send(l);
        }

        public static void Click(string button, int count)
        {
            for (int n = 0; n < count; n++)
            {
                Down(button);
                Up(button);
                if (n + 1 < count) Thread.Sleep(30);
            }
        }

        public static void Scroll(int dx, int dy)
        {
            List<INPUT> l = new List<INPUT>();
            if (dy != 0) l.Add(Mouse(WHEEL, 0, 0, -dy * 120));
            if (dx != 0) l.Add(Mouse(HWHEEL, 0, 0, dx * 120));
            Send(l);
        }

        public static void Zoom(int dy)
        {
            List<INPUT> l = new List<INPUT>();
            l.Add(Key(0x11, 0, 0));
            if (dy != 0) l.Add(Mouse(WHEEL, 0, 0, -dy * 120));
            l.Add(Key(0x11, 0, KEYUP));
            Send(l);
        }

        static bool Lookup(string name, out ushort vk, out bool extended)
        {
            extended = false;
            switch (name)
            {
                case "esc": vk = 0x1B; return true;
                case "tab": vk = 0x09; return true;
                case "backspace": vk = 0x08; return true;
                case "enter": vk = 0x0D; return true;
                case "space": vk = 0x20; return true;
                case "delete": vk = 0x2E; extended = true; return true;
                case "up": vk = 0x26; extended = true; return true;
                case "down": vk = 0x28; extended = true; return true;
                case "left": vk = 0x25; extended = true; return true;
                case "right": vk = 0x27; extended = true; return true;
                case "home": vk = 0x24; extended = true; return true;
                case "end": vk = 0x23; extended = true; return true;
                case "pageup": vk = 0x21; extended = true; return true;
                case "pagedown": vk = 0x22; extended = true; return true;
            }
            vk = 0;
            return false;
        }

        public static void PressKey(string name)
        {
            ushort vk;
            bool ext;
            if (!Lookup(name, out vk, out ext)) return;
            uint f = ext ? EXTENDED : 0;
            List<INPUT> l = new List<INPUT>();
            l.Add(Key(vk, 0, f));
            l.Add(Key(vk, 0, f | KEYUP));
            Send(l);
        }

        public static void Text(string text)
        {
            List<INPUT> l = new List<INPUT>();
            foreach (char c in text)
            {
                l.Add(Key(0, c, UNICODE));
                l.Add(Key(0, c, UNICODE | KEYUP));
            }
            Send(l);
        }

        public static void Paste()
        {
            Thread.Sleep(60);
            List<INPUT> l = new List<INPUT>();
            l.Add(Key(0x11, 0, 0));
            l.Add(Key(0x56, 0, 0));
            l.Add(Key(0x56, 0, KEYUP));
            l.Add(Key(0x11, 0, KEYUP));
            Send(l);
        }
    }
}
"@

[Console]::Out.WriteLine('@@READY')
[Console]::Out.Flush()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $p = $line.Split(' ')
    try {
        switch ($p[0]) {
            'M' { [LDIn.Native]::Move([int]$p[1], [int]$p[2]) }
            'C' { [LDIn.Native]::Click([string]$p[1], [int]$p[2]) }
            'D' { [LDIn.Native]::Down([string]$p[1]) }
            'U' { [LDIn.Native]::Up([string]$p[1]) }
            'S' { [LDIn.Native]::Scroll([int]$p[1], [int]$p[2]) }
            'Z' { [LDIn.Native]::Zoom([int]$p[1]) }
            'K' { [LDIn.Native]::PressKey([string]$p[1]) }
            'T' { [LDIn.Native]::Text([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[1]))) }
            'P' { [LDIn.Native]::Paste() }
        }
    } catch {
    }
}

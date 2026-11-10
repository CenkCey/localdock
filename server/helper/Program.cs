using System.Text;

namespace LocalDock.Helper;

internal static class Program
{
    [STAThread]
    private static int Main()
    {
        try
        {
            Native.SetProcessDPIAware();
            var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
            stdout.NewLine = "\n";
            stdout.AutoFlush = true;
            var stdin = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));

            var handler = new CommandHandler();
            handler.Initialize();

            stdout.WriteLine("@@READY");

            string? line;
            while ((line = stdin.ReadLine()) != null)
            {
                if (line.Length == 0) continue;
                stdout.WriteLine(Protocol.Respond(line, handler));
            }
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("fatal: " + ex);
            return 1;
        }
    }
}

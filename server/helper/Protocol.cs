using System.Text;
using System.Text.Json;

namespace LocalDock.Helper;

internal static class Protocol
{
    public static string Respond(string line, CommandHandler handler)
    {
        long rid = 0;
        try
        {
            byte[] raw = Convert.FromBase64String(line.Trim());
            using JsonDocument doc = JsonDocument.Parse(raw);
            JsonElement root = doc.RootElement;
            if (root.TryGetProperty("rid", out JsonElement ridEl) && ridEl.ValueKind == JsonValueKind.Number)
            {
                rid = ridEl.GetInt64();
            }
            object? data = handler.Execute(new Request(root));
            return Pack(rid, true, data, null);
        }
        catch (Exception ex)
        {
            return Pack(rid, false, null, ex.Message);
        }
    }

    private static string Pack(long rid, bool ok, object? data, string? error)
    {
        var reply = new Dictionary<string, object?>
        {
            ["rid"] = rid,
            ["ok"] = ok,
            ["data"] = data,
            ["error"] = error
        };
        string json;
        try
        {
            json = JsonSerializer.Serialize(reply);
        }
        catch (Exception ex)
        {
            json = JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["rid"] = rid,
                ["ok"] = false,
                ["data"] = null,
                ["error"] = ex.Message
            });
        }
        return "@@" + Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
    }
}

internal sealed class Request
{
    private readonly JsonElement root;

    public Request(JsonElement root)
    {
        this.root = root;
        Cmd = Str("cmd");
    }

    public string Cmd { get; }

    public string Str(string name)
    {
        if (root.TryGetProperty(name, out JsonElement el) && el.ValueKind == JsonValueKind.String)
        {
            return el.GetString() ?? "";
        }
        return "";
    }

    public int Int(string name)
    {
        if (root.TryGetProperty(name, out JsonElement el))
        {
            if (el.ValueKind == JsonValueKind.Number) return (int)Math.Round(el.GetDouble());
            if (el.ValueKind == JsonValueKind.String && double.TryParse(el.GetString(), out double d)) return (int)Math.Round(d);
        }
        return 0;
    }

    public List<string> StrList(string name)
    {
        var list = new List<string>();
        if (root.TryGetProperty(name, out JsonElement el) && el.ValueKind == JsonValueKind.Array)
        {
            foreach (JsonElement item in el.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String) list.Add(item.GetString() ?? "");
            }
        }
        return list;
    }
}

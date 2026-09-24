// BoloUiCore compatibility host.
// SPDX-License-Identifier: Apache-2.0

using System.Diagnostics;

const string engineVariable = "BOLOUICORE_ENGINE_BIN";

static string? ResolveEngine()
{
    var configured = Environment.GetEnvironmentVariable(engineVariable);
    if (!string.IsNullOrWhiteSpace(configured))
    {
        var fullPath = Path.GetFullPath(configured);
        if (!File.Exists(fullPath))
        {
            Console.Error.WriteLine($"BOLOUICORE_ENGINE_NOT_FOUND path={fullPath}");
            return null;
        }
        return fullPath;
    }

    var executableDirectory = AppContext.BaseDirectory;
    var names = OperatingSystem.IsWindows()
        ? new[] { "aioncore-engine.exe", "aioncore.exe" }
        : new[] { "aioncore-engine", "aioncore" };

    foreach (var name in names)
    {
        var candidate = Path.Combine(executableDirectory, name);
        if (File.Exists(candidate)) return candidate;
    }

    return null;
}

static void ForwardLine(string? line, TextWriter writer)
{
    if (line is null) return;
    if (line.StartsWith("AIONCORE_LISTENING ", StringComparison.Ordinal))
    {
        writer.WriteLine("BOLOUICORE_LISTENING " + line["AIONCORE_LISTENING ".Length..]);
    }
    else if (line.Equals("AIONCORE_READY", StringComparison.Ordinal))
    {
        writer.WriteLine("BOLOUICORE_READY");
    }
    else
    {
        writer.WriteLine(line);
    }
    writer.Flush();
}

var engine = ResolveEngine();
if (engine is null)
{
    Console.Error.WriteLine(
        $"BOLOUICORE_ENGINE_NOT_FOUND Set {engineVariable} or place aioncore-engine next to bolouicore.");
    return 127;
}

var startInfo = new ProcessStartInfo
{
    FileName = engine,
    UseShellExecute = false,
    RedirectStandardOutput = true,
    RedirectStandardError = true,
    CreateNoWindow = true,
};
foreach (var argument in args) startInfo.ArgumentList.Add(argument);

using var child = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
if (!child.Start())
{
    Console.Error.WriteLine("BOLOUICORE_ENGINE_START_FAILED");
    return 126;
}

Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    try
    {
        if (!child.HasExited) child.Kill(entireProcessTree: true);
    }
    catch
    {
        // The child may have exited between the state check and termination.
    }
};

var stdout = Task.Run(async () =>
{
    while (await child.StandardOutput.ReadLineAsync() is { } line) ForwardLine(line, Console.Out);
});
var stderr = Task.Run(async () =>
{
    while (await child.StandardError.ReadLineAsync() is { } line) ForwardLine(line, Console.Error);
});

await child.WaitForExitAsync();
await Task.WhenAll(stdout, stderr);
return child.ExitCode;

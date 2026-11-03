using System.Diagnostics;
using System.Globalization;
using System.Text.Json;

namespace VocaCycle.Worker.Services;

public sealed class SessionAudioAssembler(IConfiguration configuration)
{
    private string Ffmpeg => configuration["FFmpeg:Path"] ?? "ffmpeg";
    private string Ffprobe => configuration["FFmpeg:ProbePath"] ?? "ffprobe";
    public async Task CheckAsync(CancellationToken token)
    {
        await RunAsync(Ffmpeg, ["-version"], token);
        await RunAsync(Ffprobe, ["-version"], token);
    }
    public async Task<long> NormalizeAsync(string mp3, string wav, CancellationToken token, double trailingSilenceSeconds = 0.35)
    {
        await RunAsync(Ffmpeg, ["-nostdin", "-v", "error", "-y", "-i", mp3, "-ar", "24000", "-ac", "1", "-af", $"apad=pad_dur={trailingSilenceSeconds.ToString(CultureInfo.InvariantCulture)}", "-c:a", "pcm_s16le", wav], token);
        var duration = await DurationAsync(wav, token);
        if (duration <= 0 || duration > 120_000) throw new InvalidDataException("Invalid segment duration.");
        return duration;
    }
    public async Task SilenceAsync(string wav, int milliseconds, CancellationToken token)
    {
        await RunAsync(Ffmpeg, ["-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
            "-t", (milliseconds / 1000.0).ToString(CultureInfo.InvariantCulture), "-c:a", "pcm_s16le", wav], token);
    }
    public async Task<long> AssembleAsync(string directory, int count, CancellationToken token)
    {
        var manifest = Path.Combine(directory, "concat.txt");
        await File.WriteAllLinesAsync(manifest, Enumerable.Range(0, count).Select(i => $"file 'parts/{i}.wav'"), token);
        var temporary = Path.Combine(directory, "audio.tmp.mp3");
        await RunAsync(Ffmpeg, ["-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "1", "-i", manifest,
            "-c:a", "libmp3lame", "-b:a", "128k", temporary], token);
        var duration = await DurationAsync(temporary, token);
        if (duration <= 0) throw new InvalidDataException("Empty assembled recording.");
        File.Move(temporary, Path.Combine(directory, "audio.mp3"), true);
        return duration;
    }
    private async Task<long> DurationAsync(string path, CancellationToken token)
    {
        var json = await RunAsync(Ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "json", path], token);
        using var document = JsonDocument.Parse(json);
        var seconds = double.Parse(document.RootElement.GetProperty("format").GetProperty("duration").GetString()!, CultureInfo.InvariantCulture);
        if (!double.IsFinite(seconds)) throw new InvalidDataException("Invalid audio duration.");
        return checked((long)Math.Round(seconds * 1000));
    }
    private static async Task<string> RunAsync(string executable, string[] arguments, CancellationToken token)
    {
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromMinutes(2));
        using var process = Process.Start(start) ?? throw new IOException("Could not start audio processing.");
        var output = process.StandardOutput.ReadToEndAsync(timeout.Token);
        var errors = process.StandardError.ReadToEndAsync(timeout.Token);
        try
        {
            await process.WaitForExitAsync(timeout.Token);
            await errors;
            if (process.ExitCode != 0) throw new SessionGenerationException("Audio processing failed. Check the worker's FFmpeg installation.");
            return await output;
        }
        finally { if (!process.HasExited) { process.Kill(entireProcessTree: true); await process.WaitForExitAsync(CancellationToken.None); } }
    }
}

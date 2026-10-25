namespace VocaCycle.Worker.Services;

using System.Net.Http.Json;

public class TtsService
{
    private readonly HttpClient _httpClient;

    public TtsService(IHttpClientFactory httpClientFactory)
    {
        _httpClient = httpClientFactory.CreateClient("Tts");
    }

    public async Task<byte[]> SynthesizeAsync(
        string text,
        CancellationToken cancellationToken)
    {
        using var response = await _httpClient.PostAsJsonAsync(
            "/synthesize",
            new { text },
            cancellationToken);

        response.EnsureSuccessStatusCode();

        return await response.Content.ReadAsByteArrayAsync(
            cancellationToken);
    }
    public async Task SaveAudioAsync(
    string text,
    string outputPath,
    CancellationToken cancellationToken)
    {
        byte[] audio = await SynthesizeAsync(text, cancellationToken);

        string? directory = Path.GetDirectoryName(outputPath);

        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await File.WriteAllBytesAsync(
            outputPath,
            audio,
            cancellationToken);
    }
}
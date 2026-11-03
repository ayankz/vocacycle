using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace VocaCycle.Worker.Services;

public sealed class SessionGenerationException(string message) : Exception(message);

public sealed class SessionSpeechClient(IHttpClientFactory clients, IConfiguration configuration)
{
    private string OutputFormat => configuration["ElevenLabs:OutputFormat"] ?? "mp3_44100_128";

    // Includes every synthesis input; API keys and timeouts do not change audio identity.
    public string CacheKey(string text, string language) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
        JsonSerializer.Serialize(new { version = 1, provider = "ElevenLabs", endpoint = "v1/text-to-speech",
            text, language, model = configuration["ElevenLabs:ModelId"], voice = configuration["ElevenLabs:VoiceId"],
            outputFormat = OutputFormat }))));

    public void ValidateConfiguration()
    {
        if (new[] { "ApiKey", "VoiceId", "ModelId" }.Any(key => string.IsNullOrWhiteSpace(configuration[$"ElevenLabs:{key}"])))
            throw new SessionGenerationException("Configure the worker's ElevenLabs API key, multilingual model and voice before generating audio.");
        if (OutputFormat is not ("mp3_22050_32" or "mp3_44100_64" or "mp3_44100_128"))
            throw new SessionGenerationException("Configure an MP3 ElevenLabs output format supported by the worker.");
    }

    public async Task<byte[]> SynthesizeAsync(string text, string language, CancellationToken token)
    {
        ValidateConfiguration();
        if (text.Length is 0 or > 220 || language is not ("en" or "ru")) throw new InvalidDataException("Invalid speech segment.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://api.elevenlabs.io/v1/text-to-speech/{Uri.EscapeDataString(configuration["ElevenLabs:VoiceId"]!)}?output_format={OutputFormat}");
        request.Headers.Add("xi-api-key", configuration["ElevenLabs:ApiKey"]);
        request.Content = JsonContent.Create(new { text, language_code = language, model_id = configuration["ElevenLabs:ModelId"] });
        using var response = await clients.CreateClient("SessionElevenLabs").SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (!response.IsSuccessStatusCode)
            throw new SessionGenerationException($"Speech generation was rejected (HTTP {(int)response.StatusCode}). Check worker configuration and provider quota.");
        if (response.Content.Headers.ContentType?.MediaType is not ("audio/mpeg" or "audio/mp3") || response.Content.Headers.ContentLength > 2_097_152)
            throw new InvalidDataException("Invalid speech audio response.");
        await using var input = await response.Content.ReadAsStreamAsync(timeout.Token);
        using var bytes = new MemoryStream();
        var buffer = new byte[8192];
        int read;
        while ((read = await input.ReadAsync(buffer, timeout.Token)) != 0)
        {
            if (bytes.Length + read > 2_097_152) throw new InvalidDataException("Speech segment too large.");
            bytes.Write(buffer, 0, read);
        }
        var result = bytes.ToArray();
        if (result.Length < 3 || !(result[0] == 'I' && result[1] == 'D' && result[2] == '3'
            || result[0] == 0xff && (result[1] & 0xe0) == 0xe0)) throw new InvalidDataException("Invalid MP3 segment.");
        return result;
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace VocaCycle.Worker.Services;

public sealed class PronunciationAudioClient(IHttpClientFactory clients, IConfiguration configuration)
{
    private const int MaxBytes = 2_097_152;
    public bool IsConfigured(out string diagnostic)
    {
        diagnostic = "Configure ElevenLabs ApiKey, VoiceId, ModelId, VoiceAccent=en-US, TimeoutSeconds (1–20), and an MP3 OutputFormat.";
        var section = configuration.GetSection("ElevenLabs");
        return !string.IsNullOrWhiteSpace(section["ApiKey"])
            && !string.IsNullOrWhiteSpace(section["VoiceId"])
            && !string.IsNullOrWhiteSpace(section["ModelId"])
            && section["VoiceAccent"] == "en-US"
            && int.TryParse(section["TimeoutSeconds"], out var seconds) && seconds is >= 1 and <= 20
            && section["OutputFormat"] is "mp3_22050_32" or "mp3_44100_64" or "mp3_44100_128";
    }

    public async Task<byte[]> SynthesizeAsync(string word, CancellationToken cancellationToken)
    {
        if (!IsConfigured(out var diagnostic)) throw new InvalidOperationException(diagnostic);
        var section = configuration.GetSection("ElevenLabs");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(int.Parse(section["TimeoutSeconds"]!)));
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://api.elevenlabs.io/v1/text-to-speech/{Uri.EscapeDataString(section["VoiceId"]!)}?output_format={section["OutputFormat"]}");
        request.Headers.Add("xi-api-key", section["ApiKey"]);
        request.Content = JsonContent.Create(new { text = word, model_id = section["ModelId"], language_code = "en" });
        using var response = await clients.CreateClient("PronunciationElevenLabs")
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (!response.IsSuccessStatusCode)
        {
            // Safe diagnostics only; upstream bodies may contain sensitive data.
            var category = response.StatusCode switch
            {
                HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => "credentials-or-quota",
                HttpStatusCode.PaymentRequired => "quota",
                HttpStatusCode.TooManyRequests => "transient-rate-limit",
                >= HttpStatusCode.InternalServerError => "transient-server",
                _ => "permanent-request"
            };
            // Read only a bounded machine status, never include the upstream message.
            try
            {
                await response.Content.LoadIntoBufferAsync(16_384, timeout.Token);
                using var error = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
                if (error.RootElement.ValueKind == JsonValueKind.Object
                    && error.RootElement.TryGetProperty("detail", out var detail) && detail.ValueKind == JsonValueKind.Object
                    && detail.TryGetProperty("status", out var status) && status.ValueKind == JsonValueKind.String)
                    category = status.GetString() switch
                    {
                        "quota_exceeded" => "quota",
                        "invalid_api_key" => "credentials",
                        "too_many_concurrent_requests" or "system_busy" => "transient-rate-limit",
                        _ => category
                    };
            }
            catch (Exception ex) when (ex is JsonException or HttpRequestException) { }
            throw new PronunciationSynthesisException(category);
        }
        return await ReadMp3Async(response, timeout.Token);
    }

    public async Task<byte[]> DownloadDictionaryAsync(string url, CancellationToken cancellationToken)
    {
        if (!DictionaryPronunciation.IsAllowedAudioUrl(url)) throw new InvalidOperationException("Dictionary audio URL rejected.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        cancellationToken = timeout.Token;
        using var response = await clients.CreateClient("PronunciationDictionaryAudio")
            .GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode(); // Includes redirects, which are disabled on the handler.
        return await ReadMp3Async(response, cancellationToken);
    }

    private static async Task<byte[]> ReadMp3Async(HttpResponseMessage response, CancellationToken token)
    {
        if (response.Content.Headers.ContentType?.MediaType is not ("audio/mpeg" or "audio/mp3")
            || response.Content.Headers.ContentLength is > MaxBytes)
            throw new InvalidDataException("Invalid pronunciation audio response.");
        await using var stream = await response.Content.ReadAsStreamAsync(token);
        using var output = new MemoryStream();
        var buffer = new byte[8192];
        int read;
        while ((read = await stream.ReadAsync(buffer, token)) > 0)
        {
            if (output.Length + read > MaxBytes) throw new InvalidDataException("Pronunciation audio exceeds size limit.");
            output.Write(buffer, 0, read);
        }
        var bytes = output.ToArray();
        if (bytes.Length < 3 || !(bytes[0] == 'I' && bytes[1] == 'D' && bytes[2] == '3'
            || bytes[0] == 0xff && (bytes[1] & 0xe0) == 0xe0))
            throw new InvalidDataException("Empty or invalid MP3 response.");
        return bytes;
    }
}

public sealed class PronunciationSynthesisException(string category) : Exception(category);

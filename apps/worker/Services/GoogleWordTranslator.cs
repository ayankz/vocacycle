using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace VocaCycle.Worker.Services;

public sealed class GoogleWordTranslator(HttpClient client, IConfiguration configuration) : IWordTranslator
{
    public async Task<string> TranslateAsync(string text, CancellationToken cancellationToken)
    {
        var apiKey = configuration["GoogleTranslation:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("GoogleTranslation:ApiKey is not configured.");

        using var request = new HttpRequestMessage(HttpMethod.Post, "language/translate/v2");
        // Keep the key out of URLs and redact the header in HttpClient logs.
        request.Headers.Add("x-goog-api-key", apiKey);
        request.Content = JsonContent.Create(new { q = text, source = "en", target = "ru", format = "text" });
        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        using var payload = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var translation = WebUtility.HtmlDecode(payload.RootElement
            .GetProperty("data").GetProperty("translations")[0].GetProperty("translatedText").GetString())?.Trim();
        if (string.IsNullOrWhiteSpace(translation))
            throw new InvalidOperationException("Google returned an empty translation.");
        return translation;
    }
}

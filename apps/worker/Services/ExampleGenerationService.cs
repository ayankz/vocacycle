using System.Net.Http.Json;
using System.Text.Json;

namespace VocaCycle.Worker.Services;

public class ExampleGenerationService
{
    private readonly HttpClient _httpClient;

    public ExampleGenerationService(IHttpClientFactory httpClientFactory)
    {
        _httpClient = httpClientFactory.CreateClient("Ollama");
    }

    public async Task<List<string>> GenerateAsync(
        string word,
        CancellationToken cancellationToken)
    {
        var request = new
        {
            model = "qwen3:1.7b",
            prompt = $"Generate exactly 5 short English sentences using the word {word}.",
            stream = false,
            think = false,
            format = "json"
        };

        var result = await _httpClient.PostAsJsonAsync(
            "/api/generate",
            request,
            cancellationToken
        );

        result.EnsureSuccessStatusCode();

        var json = await result.Content.ReadAsStringAsync(cancellationToken);

        using var ollamaJson = JsonDocument.Parse(json);

        var responseText = ollamaJson.RootElement
            .GetProperty("response")
            .GetString();

        using var sentencesJson = JsonDocument.Parse(responseText!);

        var sentences = sentencesJson.RootElement
            .GetProperty("sentences")
            .EnumerateArray()
            .Select(x => x.GetString()!)
            .ToList();

        return sentences;
    }
}
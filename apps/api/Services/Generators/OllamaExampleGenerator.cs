namespace VocaCycle.Api.Services.Generators;

using System.Net.Http.Json;
using System.Text.Json;

public class OllamaExampleGenerator : IExampleGenerator
{
    private readonly HttpClient _httpClient;
    public OllamaExampleGenerator(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }
    public async Task<List<string>> GenerateAsync(
        string word,
        string translation)
    {
        var prompt = $"""
        Generate exactly 5 English sentences.
        Word: {word}
        Meaning: {translation}
        Use B1-B2 English.
        Every sentence MUST contain the exact word "{word}".
        Do not change its form.
        Do not use synonyms, plurals, or related words instead.
        For example, if the word is "resilient", do not use "resilience".
        Return valid JSON with a "sentences" array containing exactly 5 strings.
        Do not include explanations.
        """;

        var request = new
        {
            model = "qwen3:1.7b",
            prompt,
            stream = false,
            think = false,
            format = "json"
        };
        var response = await _httpClient.PostAsJsonAsync(
       "/api/generate",
       request);

        response.EnsureSuccessStatusCode();

        var result = await response.Content
        .ReadFromJsonAsync<OllamaResponse>();

        var sentences = JsonSerializer.Deserialize<SentencesResponse>(
            result!.Response, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

        if (sentences?.Sentences is not { Count: 5 })
        {
            throw new InvalidOperationException(
                "Ollama must generate exactly 5 sentences.");
        }
        foreach (var sentence in sentences.Sentences)
        {
            var words = sentence.Split(
                [' ', '.', ',', '!', '?', ';', ':'],
                StringSplitOptions.RemoveEmptyEntries);

            if (!words.Contains(word, StringComparer.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"Generated sentence does not contain the word '{word}': {sentence}");
            }
        }
        return sentences.Sentences;
    }
    private record OllamaResponse(string Response);
    private record SentencesResponse(List<string> Sentences);
}
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
        string? translation)
    {
        var translationGuidance = string.IsNullOrWhiteSpace(translation)
            ? "No translation is available. Infer the most common meaning from the English word and use it consistently."
            : $"Russian translation: \"{translation}\"";
        var prompt = $"""
       You are an experienced English vocabulary teacher.

      Your task is to generate exactly 5 natural English example
    sentences to help a language learner understand and remember
    a vocabulary word.


    Target word: "{word}"
    {translationGuidance}
    ENGLISH LEVEL: B1-B2

    STRICT RULES:
     1. Generate exactly 5 complete English sentences.

    2. Every sentence MUST contain the exact target word "{word}".
       Do not change its spelling or grammatical form.
       Do not use derivatives, synonyms, or alternative forms.
       Capitalization may differ.

    3. Use natural, grammatically correct, everyday English.
       Avoid awkward expressions, unnatural word combinations,
       and sentences that native speakers would rarely use.

    4. Use the target word with its intended meaning,
       based on the provided Russian translation.

    5. Each sentence must demonstrate a different realistic context.
       Prefer situations involving daily life, work, education,
       technology, communication, or relationships.

    6. Use common collocations and natural sentence structures.

    7. Keep sentences between 8 and 16 words when possible.

    8. Make sentences suitable for listening practice.
       Avoid complicated grammar, unnecessary details,
       and difficult vocabulary.

    9. Do not repeat the same sentence structure or context.

    10. Prioritize natural English over creativity.
        Never invent unusual contexts just to include the word.

    IMPORTANT EXAMPLE:
     Target word: "concurrent"

    GOOD: "The company is managing several concurrent projects."
    GOOD: "The server can handle multiple concurrent requests."
    GOOD: "The university offers concurrent courses in different subjects."

    BAD: "The traffic lights were concurrent at the intersection."
    BAD: "The data was concurrent in its collection."
    BAD: "The projects were running concurrently."

      OUTPUT FORMAT:

    Return ONLY a valid JSON object containing a
    "sentences" array with exactly 5 strings.

    Do not include explanations, markdown, or additional text.
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

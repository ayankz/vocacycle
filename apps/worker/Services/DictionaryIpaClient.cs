using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace VocaCycle.Worker.Services;

/// <summary>Only dictionary phonetic fields are read; definitions and examples are ignored.</summary>
public sealed class DictionaryIpaClient(HttpClient client)
{
    public async Task<string?> LookupAsync(string word, CancellationToken cancellationToken)
    {
        using var response = await client.GetAsync(
            $"api/v2/entries/en/{Uri.EscapeDataString(word)}", cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode(); // Includes 429/5xx; the stream delivery will retry.
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        if (json.RootElement.ValueKind != JsonValueKind.Array)
            throw new JsonException("Expected dictionary entries array.");

        var phonetics = new List<string>();
        var fallbacks = new List<string>();
        foreach (var entry in json.RootElement.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object) continue;
            if (entry.TryGetProperty("phonetics", out var values) && values.ValueKind == JsonValueKind.Array)
                foreach (var value in values.EnumerateArray())
                    if (value.ValueKind == JsonValueKind.Object) Add(value, "text", phonetics);
            Add(entry, "phonetic", fallbacks);
        }
        // Prefer marked IPA within each source, with stable response order as the tie-breaker.
        return Select(phonetics) ?? Select(fallbacks);
    }

    private static void Add(JsonElement entry, string name, List<string> candidates)
    {
        if (entry.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String)
        {
            var candidate = value.GetString()!.Trim();
            if (IsValid(candidate)) candidates.Add(candidate);
        }
    }

    private static string? Select(List<string> values) =>
        values.FirstOrDefault(value => value[0] is '/' or '[') ?? values.FirstOrDefault();

    public static bool IsValid(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 128) return false;
        var body = value;
        if (body.Length >= 3 && (body.StartsWith('/') && body.EndsWith('/') || body.StartsWith('[') && body.EndsWith(']')))
            body = body[1..^1];
        // English IPA letters, IPA extensions, combining marks, stress/length and syllable marks.
        // Excludes URLs, prose punctuation, nested/mismatched delimiters, digits and markup.
        return body.Length > 0 && !body.StartsWith('-') && !body.EndsWith('-')
            && body.Count(c => c == '(') == body.Count(c => c == ')')
            && Regex.IsMatch(body, @"^[a-zæçðøŋœħıǀ-ǃɐ-ʯʰ-˿\p{M}. ()‿-]+$")
            && Regex.IsMatch(body, @"[a-zæçðøŋœħıɐ-ʯ]")
            && !body.Contains("  ") && body.Split(' ').Length <= 4;
    }
}

namespace VocaCycle.Infrastructure.Models;

public sealed record SessionExample(string Text, string Translation);
public sealed record SessionWordContent(string Word, string Translation, List<SessionExample> Examples)
{
    public static bool IsValidPair(string word, string? translation) =>
        word.Length is > 0 and <= 80 && System.Text.RegularExpressions.Regex.IsMatch(word, @"^[A-Za-z]+(?:[ '’-][A-Za-z]+)*$")
        && !string.IsNullOrWhiteSpace(translation) && translation.Length <= 220 && !translation.Any(char.IsControl)
        && System.Text.RegularExpressions.Regex.IsMatch(translation, "[А-Яа-яЁё]")
        && !System.Text.RegularExpressions.Regex.IsMatch(translation, "[A-Za-z<>]");
}
public sealed record AudioTimelineEntry(long WordId, int WordPosition, int? ExamplePosition,
    string Kind, string Text, string Language, long StartMs, long EndMs);

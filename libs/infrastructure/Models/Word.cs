namespace VocaCycle.Infrastructure.Models;

public class Word
{
    public long Id { get; set; }
    public required string Text { get; set; }
    public string? Translation { get; set; }
    public string? Ipa { get; set; }
    public string? PronunciationAudioUrl { get; set; }
    // Internal checkpoints survive stream redelivery and worker restarts.
    [System.Text.Json.Serialization.JsonIgnore]
    public string? DictionaryPronunciation { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public bool PronunciationSynthesisAttempted { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public DateTimeOffset? DeletedAt { get; set; }
    public List<WordExample> Examples { get; set; } = [];
}

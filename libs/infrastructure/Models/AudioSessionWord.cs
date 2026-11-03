namespace VocaCycle.Infrastructure.Models;

public class AudioSessionWord
{
    public long AudioSessionId { get; set; }

    public AudioSession AudioSession { get; set; } = null!;

    public long WordId { get; set; }
    public Word Word { get; set; } = null!;

    // Immutable per-session examples/translation; shared word examples may evolve.
    [System.Text.Json.Serialization.JsonIgnore]
    public string? ContentJson { get; set; }

    public int Position { get; set; }
}
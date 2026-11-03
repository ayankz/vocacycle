namespace VocaCycle.Infrastructure.Models;

public class AudioSession
{
    public long Id { get; set; }

    public Guid? RequestId { get; set; }
    public int ExamplesPerWord { get; set; } = 5;
    public string Stage { get; set; } = "queued";
    public string? Error { get; set; }
    public string? AudioUrl { get; set; }
    public long? DurationMs { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public string? TimelineJson { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public string? SynthesisClaimsJson { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public string Status { get; set; } = "pending";
    public bool IncludeWordTranslation { get; set; } = true;

    public bool IncludeExampleTranslations { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<AudioSessionWord> Words { get; set; } = [];
}
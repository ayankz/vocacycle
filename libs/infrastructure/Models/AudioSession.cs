namespace VocaCycle.Infrastructure.Models;

public class AudioSession
{
    public long Id { get; set; }

    public string Status { get; set; } = "pending";
    public bool IncludeWordTranslation { get; set; } = true;

    public bool IncludeExampleTranslations { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<AudioSessionWord> Words { get; set; } = [];
}
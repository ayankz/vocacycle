namespace VocaCycle.Api.Models;

public class AudioSession
{
    public long Id { get; set; }

    public string Status { get; set; } = "pending";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<AudioSessionWord> Words { get; set; } = [];
}
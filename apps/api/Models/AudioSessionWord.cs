namespace VocaCycle.Api.Models;

public class AudioSessionWord
{
    public long AudioSessionId { get; set; }

    public AudioSession AudioSession { get; set; } = null!;

    public long WordId { get; set; }
    public Word Word { get; set; } = null!;

    public int Position { get; set; }
}
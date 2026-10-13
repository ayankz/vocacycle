namespace VocaCycle.Api.Models;

public class WordExample
{
    public long Id { get; set; }

    public long WordId { get; set; }

    public Word Word { get; set; } = null!;

    public required string Text { get; set; }

    public int Position { get; set; }
}
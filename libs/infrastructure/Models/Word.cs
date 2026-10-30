namespace VocaCycle.Infrastructure.Models;

public class Word
{
    public long Id { get; set; }
    public required string Text { get; set; }
    public string? Translation { get; set; }
    public List<WordExample> Examples { get; set; } = [];
}

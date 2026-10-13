namespace VocaCycle.Api.Models;

public class Word
{
    public long Id { get; set; }
    public required string Text { get; set; }
    public required string Translation { get; set; }
    public List<WordExample> Examples { get; set; } = [];
}
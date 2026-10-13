namespace VocaCycle.Api.Services;

public interface IExampleGenerator
{
    Task<List<string>> GenerateAsync(
        string word,
        string translation);
}
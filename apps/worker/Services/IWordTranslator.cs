namespace VocaCycle.Worker.Services;

public interface IWordTranslator
{
    Task<string> TranslateAsync(string text, CancellationToken cancellationToken);
}

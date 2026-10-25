namespace VocaCycle.Worker.Services;

using Microsoft.EntityFrameworkCore;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Infrastructure.Models;
public class AudioSessionProcessor
{
    private readonly ExampleGenerationService _exampleGenerationService;
    private readonly IDbContextFactory<VocaCycleDbContext> _dbContextFactory;
    private readonly ILogger<AudioSessionProcessor> _logger;
    private readonly TtsService _ttsService;
    public AudioSessionProcessor(
    ExampleGenerationService exampleGenerationService,
    IDbContextFactory<VocaCycleDbContext> dbContextFactory,
    TtsService ttsService,
    ILogger<AudioSessionProcessor> logger)
    {
        _exampleGenerationService = exampleGenerationService;
        _dbContextFactory = dbContextFactory;
        _logger = logger;
        _ttsService = ttsService;
    }

    public async Task ProcessAsync(
    long sessionId,
    CancellationToken cancellationToken)
    {
        await using var db =
            await _dbContextFactory.CreateDbContextAsync(cancellationToken);

        var session = await db.AudioSessions
            .Include(s => s.Words)
            .ThenInclude(sw => sw.Word)
                .ThenInclude(w => w.Examples)
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

        if (session is null)
        {
            throw new InvalidOperationException(
                $"AudioSession {sessionId} not found");
        }

        session.Status = "processing";
        await db.SaveChangesAsync(cancellationToken);
        foreach (var sessionWord in session.Words.OrderBy(x => x.Position))
        {
            var word = sessionWord.Word;
            var existingCount = await db.WordExamples
    .CountAsync(x => x.WordId == word.Id, cancellationToken);

            if (existingCount == 5)
            {
                _logger.LogInformation(
                    "Word {Word} already has 5 examples. Skipping generation.",
                    word.Text);
                continue;
            }

            if (existingCount != 0)
            {
                throw new InvalidOperationException(
                    $"Word '{word.Text}' has {existingCount} examples. Expected 0 or 5.");
            }
            var sentences = await _exampleGenerationService.GenerateAsync(
                word.Text,
                cancellationToken
            );
            if (sentences.Count != 5 ||
    sentences.Any(s => string.IsNullOrWhiteSpace(s)))
            {
                throw new InvalidOperationException(
                    $"Ollama returned invalid examples for word '{word.Text}'");
            }
            for (int i = 0; i < sentences.Count; i++)
            {
                var example = new WordExample
                {
                    WordId = word.Id,
                    Text = sentences[i],
                    Position = i + 1
                };

                db.WordExamples.Add(example);

                _logger.LogInformation(
                    "Prepared example for {Word}: {Sentence}",
                    word.Text,
                    sentences[i]
                );
            }
        }
        await db.SaveChangesAsync(cancellationToken);
        var firstWord = session.Words
            .OrderBy(x => x.Position)
            .FirstOrDefault();

        if (firstWord is not null)
        {
            var storagePath = Environment.GetEnvironmentVariable(
       "VOCACYCLE_STORAGE"
   ) ?? throw new InvalidOperationException(
       "VOCACYCLE_STORAGE is not configured"
   );
            await db.Entry(firstWord.Word)
                .Collection(w => w.Examples)
                .LoadAsync(cancellationToken);

            var wordPath = Path.Combine(
                storagePath,
                $"session-{sessionId}-word-{firstWord.WordId}.wav"
            );

            await _ttsService.SaveAudioAsync(
                firstWord.Word.Text,
                wordPath,
                cancellationToken);

            _logger.LogInformation(
                "Word audio saved: {OutputPath}",
                wordPath);
            foreach (var example in firstWord.Word.Examples.OrderBy(e => e.Position))
            {
                var examplePath = Path.Combine(
                    storagePath,
                    $"session-{sessionId}-word-{firstWord.WordId}-example-{example.Position}.wav"
                );

                await _ttsService.SaveAudioAsync(
                    example.Text,
                    examplePath,
                    cancellationToken);

                _logger.LogInformation(
                    "Example audio saved: {OutputPath}",
                    examplePath);
            }
        }
    }
}
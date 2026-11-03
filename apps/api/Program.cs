using VocaCycle.Api.Endpoints;
using Microsoft.EntityFrameworkCore;
using VocaCycle.Infrastructure.Services;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Api.Contracts;
using VocaCycle.Infrastructure.Models;
using Npgsql;
using VocaCycle.Api.Services;
using VocaCycle.Api.Services.Generators;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddDbContext<VocaCycleDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddHttpClient<IExampleGenerator, OllamaExampleGenerator>(
client =>
{
    client.BaseAddress = new Uri("http://localhost:11434");
});

builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
{
    var options = ConfigurationOptions.Parse(
        builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379");
    options.AbortOnConnectFail = false;
    options.ConnectRetry = 0;
    options.ConnectTimeout = 500;
    options.AsyncTimeout = 500;
    options.BacklogPolicy = BacklogPolicy.FailFast;
    return ConnectionMultiplexer.Connect(options);
});

var app = builder.Build();
string? PronunciationPath(long id)
{
    var root = builder.Configuration["VOCACYCLE_STORAGE"];
    return string.IsNullOrWhiteSpace(root) ? null : Path.GetFullPath(Path.Combine(root, "pronunciations", $"word-{id}.mp3"));
}
void ValidatePronunciation(Word word)
{
    if (word.PronunciationAudioUrl != $"/words/{word.Id}/pronunciation"
        || PronunciationPath(word.Id) is not { } path || !File.Exists(path) || new FileInfo(path).Length == 0)
        word.PronunciationAudioUrl = null;
}

// Configure the HTTP request pipeline.

app.UseHttpsRedirection();

app.MapGet("/health", () => new { status = "ok" });
app.MapGet("/words/{id:long}/pronunciation", async (long id, VocaCycleDbContext db) =>
{
    var word = await db.Words.AsNoTracking().FirstOrDefaultAsync(w => w.Id == id);
    if (word is null) return Results.NotFound();
    ValidatePronunciation(word);
    if (word.PronunciationAudioUrl is null || PronunciationPath(id) is not { } path) return Results.NotFound();
    return Results.File(path, "audio/mpeg", enableRangeProcessing: true);
});

app.MapDelete("/words/{id:long}", async (long id, VocaCycleDbContext db, CancellationToken token) =>
{
    if (id <= 0) return Results.BadRequest(new { error = "Invalid word ID." });
    try
    {
        await WordDeletion.DeleteAsync(db, id, builder.Configuration["VOCACYCLE_STORAGE"], token);
        return Results.NoContent();
    }
    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
    {
        app.Logger.LogWarning("Could not remove pronunciation file for Word {WordId} ({ErrorType}).", id, ex.GetType().Name);
        return Results.Problem("Could not remove word. Please try again.", statusCode: 503);
    }
});

app.MapPost("/words", async (CreateWordRequest request, VocaCycleDbContext db, IConnectionMultiplexer redis, ILogger<Program> logger) =>
{
    if (string.IsNullOrWhiteSpace(request.Text))
    {
        return Results.BadRequest(new { error = "Text is required." });
    }
    var normalizedText = request.Text.Trim().ToLowerInvariant();

    var wordExists = await db.Words.AnyAsync(
    word => word.Text == normalizedText
);

    if (wordExists)
    {
        return Results.Conflict(new
        {
            error = "Word already exists."
        });
    }

    var word = new Word
    {
        Text = normalizedText,
        Translation = string.IsNullOrWhiteSpace(request.Translation)
            ? null
            : request.Translation.Trim()
    };

    db.Words.Add(word);
    try
    {
        await db.SaveChangesAsync();
    }
    catch (DbUpdateException ex)
        when (ex.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: "IX_Words_Text"
        })
    {
        return Results.Conflict(new
        {
            error = "Word already exists."
        });
    }

    // Persistence succeeds independently of this best-effort enqueue.
    if (string.IsNullOrWhiteSpace(word.Translation) || string.IsNullOrWhiteSpace(word.Ipa) || string.IsNullOrWhiteSpace(word.PronunciationAudioUrl))
    {
        try
        {
            await redis.GetDatabase().StreamAddAsync(
                "vocacycle:translation:jobs", new NameValueEntry[]
                {
                    new("wordId", word.Id.ToString()),
                    new("pronunciation", "1")
                });
        }
        catch (RedisException)
        {
            logger.LogWarning("Could not enqueue translation for Word {WordId}.", word.Id);
        }
    }

    return Results.Created($"/words/{word.Id}", word);
});

app.MapGet("/words", async (VocaCycleDbContext db) =>
{
    var rows = await db.Words.AsNoTracking()
        .Select(word => new
        {
            Word = word,
            HasAudioSession = db.AudioSessionWords.Any(sessionWord => sessionWord.WordId == word.Id)
        }).ToListAsync();

    foreach (var row in rows) ValidatePronunciation(row.Word);
    return Results.Ok(rows.Select(row => new
    {
        row.Word.Id, row.Word.Text, row.Word.Translation, row.Word.Ipa,
        row.Word.PronunciationAudioUrl, row.Word.Examples, row.Word.CreatedAt,
        row.HasAudioSession
    }));
});

app.MapAudioSessions();

app.MapGet("/words/{id:long}/examples", async (
    long id,
    VocaCycleDbContext db) =>
{
    var wordExists = await db.Words
        .AnyAsync(w => w.Id == id);

    if (!wordExists)
    {
        return Results.NotFound(new
        {
            error = "Word not found."
        });
    }

    var examples = await db.WordExamples
        .Where(e => e.WordId == id)
        .OrderBy(e => e.Position)
        .Select(e => new
        {
            e.Id,
            e.Text,
            e.Position
        })
        .ToListAsync();

    return Results.Ok(examples);
});

app.MapPost("/words/{id:long}/generate-examples",
    async (long id, VocaCycleDbContext db, IExampleGenerator generator) =>
    {
        var word = await db.Words
            .Include(w => w.Examples)
            .FirstOrDefaultAsync(w => w.Id == id);

        if (word is null)
        {
            return Results.NotFound();
        }
        if (word.Examples.Count > 0)
        {
            return Results.Ok(new
            {
                word.Id,
                word.Text,
                word.Translation,
                word.Ipa,
                Examples = word.Examples
                    .OrderBy(e => e.Position)
                    .Select(e => new
                    {
                        e.Id,
                        e.Text,
                        e.Position
                    })
            });
        }
        var generatedSentences = await generator.GenerateAsync(
    word.Text,
    word.Translation);

        for (int i = 0; i < generatedSentences.Count; i++)
        {
            word.Examples.Add(new WordExample
            {
                WordId = word.Id,
                Text = generatedSentences[i],
                Position = i
            });
        }

        await db.SaveChangesAsync();

        return Results.Ok(new
        {
            word.Id,
            word.Text,
            word.Translation,
            word.Ipa,
            Examples = word.Examples
                .OrderBy(e => e.Position)
                .Select(e => new
                {
                    e.Id,
                    e.Text,
                    e.Position
                })
        });
    });

app.MapPost("/audio-sessions/{id:long}/prepare-examples",
    async (
        long id,
        VocaCycleDbContext db,
        IExampleGenerator generator) =>
    {
        var session = await db.AudioSessions.IgnoreQueryFilters()
            .Include(s => s.Words)
                .ThenInclude(sw => sw.Word)
                    .ThenInclude(w => w.Examples)
            .FirstOrDefaultAsync(s => s.Id == id);

        if (session is null)
        {
            return Results.NotFound(new
            {
                error = "Audio session not found."
            });
        }
        foreach (var sessionWord in session.Words.OrderBy(sw => sw.Position))
        {
            var word = sessionWord.Word;
            // Skip words that already have examples
            if (word.Examples.Count > 0)
            {
                continue;
            }

            List<string>? sentences = null;
            // Retry generation up to 3 times
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                try
                {
                    sentences = await generator.GenerateAsync(
                        word.Text,
                        word.Translation);

                    break;
                }
                catch (InvalidOperationException ex) when (attempt < 3)
                {
                    // Try generating again
                    Console.WriteLine(
        $"Attempt {attempt} failed: {ex.Message}");
                }
            }
            if (sentences is null)
            {
                throw new InvalidOperationException(
                    $"Failed to generate examples for '{word.Text}'.");
            }

            for (int i = 0; i < sentences.Count; i++)
            {
                word.Examples.Add(new WordExample
                {
                    WordId = word.Id,
                    Text = sentences[i],
                    Position = i
                });
            }
            // Save examples after each word
            await db.SaveChangesAsync();
        }
        return Results.Ok(new
        {
            session.Id,
            Words = session.Words
                .OrderBy(sw => sw.Position)
                .Select(sw => new
                {
                    sw.WordId,
                    sw.Word.Text,
                    ExampleCount = sw.Word.Examples.Count
                })
        });
    });

app.Run();


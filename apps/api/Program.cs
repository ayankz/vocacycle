using Microsoft.EntityFrameworkCore;
using VocaCycle.Api.Data;
using VocaCycle.Api.Contracts;
using VocaCycle.Api.Models;
using Npgsql;
using VocaCycle.Api.Services;
using VocaCycle.Api.Services.Generators;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddDbContext<VocaCycleDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddHttpClient<IExampleGenerator, OllamaExampleGenerator>(
client =>
{
    client.BaseAddress = new Uri("http://localhost:11434");
});
var app = builder.Build();

// Configure the HTTP request pipeline.

app.UseHttpsRedirection();


app.MapGet("/health", () => new { status = "ok" });

app.MapPost("/words", async (CreateWordRequest request, VocaCycleDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Text)
    || string.IsNullOrWhiteSpace(request.Translation))
    {
        return Results.BadRequest(new { error = "Text and Translation are required." });
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
        Translation = request.Translation.Trim()
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

    return Results.Created($"/words/{word.Id}", word);
});

app.MapGet("/words", async (VocaCycleDbContext db) =>
{
    var words = await db.Words.ToListAsync();

    return Results.Ok(words);
});

app.MapPost("/audio-sessions", async (CreateAudioSessionRequest request,
    VocaCycleDbContext db) =>
{
    if (request.WordIds is null || request.WordIds.Count == 0)
    {
        return Results.BadRequest(new
        {
            error = "Select at least one word."
        });
    }

    if (request.WordIds.Distinct().Count() != request.WordIds.Count)
    {
        return Results.BadRequest(new
        {
            error = "Duplicate word IDs are not allowed."
        });
    }

    var words = await db.Words
        .Where(word => request.WordIds.Contains(word.Id))
        .ToListAsync();

    if (words.Count != request.WordIds.Count)
    {
        return Results.BadRequest(new
        {
            error = "One or more words do not exist."
        });
    }

    var session = new AudioSession
    {
        Words = request.WordIds
            .Select((wordId, index) => new AudioSessionWord
            {
                WordId = wordId,
                Position = index
            })
            .ToList()
    };

    db.AudioSessions.Add(session);
    await db.SaveChangesAsync();

    return Results.Created($"/audio-sessions/{session.Id}", new
    {
        session.Id,
        session.Status,
        session.CreatedAt,
        WordIds = request.WordIds
    });
});

app.MapGet("/audio-sessions/{id:long}", async (
    long id,
    VocaCycleDbContext db
) =>
{
    var session = await db.AudioSessions
    .Include(s => s.Words)
    .ThenInclude(sw => sw.Word)
    .FirstOrDefaultAsync(s => s.Id == id);

    if (session is null)
    {
        return Results.NotFound(new
        {
            error = "Audio session not found."
        });
    }
    return Results.Ok(new
    {
        session.Id,
        session.Status,
        session.CreatedAt,
        Words = session.Words
        .OrderBy(sw => sw.Position)
        .Select(sw => new
        {
            sw.WordId,
            sw.Word.Text,
            sw.Word.Translation,
            sw.Position
        })
    });
});

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
        var session = await db.AudioSessions
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


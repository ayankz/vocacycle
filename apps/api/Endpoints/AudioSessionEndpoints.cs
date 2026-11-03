using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using StackExchange.Redis;
using VocaCycle.Api.Contracts;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Infrastructure.Models;

namespace VocaCycle.Api.Endpoints;

public static class AudioSessionEndpoints
{
    public static void MapAudioSessions(this WebApplication app)
    {
        app.MapPost("/audio-sessions", CreateAsync);
        app.MapGet("/audio-sessions/{id:long}", async (long id, VocaCycleDbContext db, IConfiguration config, CancellationToken token) =>
        {
            var session = await ReadAsync(db, id, token);
            return session is null ? Results.NotFound() : Results.Ok(Response(session, config));
        });
        app.MapGet("/audio-sessions/{id:long}/audio", async (long id, VocaCycleDbContext db, IConfiguration config, CancellationToken token) =>
        {
            var session = await db.AudioSessions.AsNoTracking().SingleOrDefaultAsync(s => s.Id == id, token);
            var path = FilePath(config, id, "audio.mp3");
            return session?.Status == "ready" && path is not null && File.Exists(path)
                ? Results.File(path, "audio/mpeg", enableRangeProcessing: true) : Results.NotFound();
        });
        app.MapGet("/audio-sessions/{id:long}/timeline", async (long id, VocaCycleDbContext db, IConfiguration config, CancellationToken token) =>
        {
            var session = await db.AudioSessions.AsNoTracking().SingleOrDefaultAsync(s => s.Id == id, token);
            return session?.Status == "ready" && ArtifactsExist(config, id) && session.TimelineJson is not null
                ? Results.Text(session.TimelineJson, "application/json") : Results.NotFound();
        });
    }

    private static async Task<IResult> CreateAsync(CreateAudioSessionRequest request, VocaCycleDbContext db,
        IConnectionMultiplexer redis, IConfiguration config, CancellationToken token)
    {
        if (request.WordIds is not { Count: > 0 and <= 20 } || request.WordIds.Any(id => id <= 0)
            || request.WordIds.Distinct().Count() != request.WordIds.Count)
            return Results.BadRequest(new { error = "Select 1–20 distinct active words." });
        var requestId = request.RequestId ?? Guid.NewGuid();
        if (requestId == Guid.Empty) return Results.BadRequest(new { error = "Invalid request ID." });
        var existing = await db.AudioSessions.IgnoreQueryFilters().Include(s => s.Words).ThenInclude(w => w.Word)
            .SingleOrDefaultAsync(s => s.RequestId == requestId, token);
        if (existing is not null)
        {
            // Recover a save-before-publish crash with the same idempotency key.
            var result = Existing(existing, request, config);
            if (result is IStatusCodeHttpResult { StatusCode: 409 }) return result;
            if (existing.Status == "pending") await QueueAsync(existing.Id, db, redis);
            return Existing(existing, request, config);
        }
        var words = await db.Words.Where(w => request.WordIds.Contains(w.Id)).ToListAsync(token);
        if (words.Count != request.WordIds.Count) return Results.BadRequest(new { error = "One or more words are no longer available." });
        if (words.Any(w => !SessionWordContent.IsValidPair(w.Text, w.Translation)))
            return Results.BadRequest(new { error = "Every selected word must have valid English text and a stored Russian translation before generating Pairs audio." });
        var session = new AudioSession
        {
            // Zero distinguishes Pairs from legacy example sessions without a schema change.
            // Legacy request settings are accepted but ignored for new sessions.
            RequestId = requestId, ExamplesPerWord = 0,
            IncludeWordTranslation = true, IncludeExampleTranslations = false,
            Words = request.WordIds.Select((id, position) => new AudioSessionWord { WordId = id, Position = position }).ToList()
        };
        db.Add(session);
        try { await db.SaveChangesAsync(token); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            db.ChangeTracker.Clear();
            existing = await db.AudioSessions.IgnoreQueryFilters().Include(s => s.Words).ThenInclude(w => w.Word)
                .SingleAsync(s => s.RequestId == requestId, token);
            return Existing(existing, request, config);
        }
        await QueueAsync(session.Id, db, redis);
        db.ChangeTracker.Clear();
        return Results.Created($"/audio-sessions/{session.Id}", Response((await ReadAsync(db, session.Id, CancellationToken.None))!, config));
    }

    private static async Task QueueAsync(long id, VocaCycleDbContext db, IConnectionMultiplexer redis)
    {
        try
        {
            await redis.GetDatabase().StreamAddAsync("vocacycle:audio:jobs", "sessionId", id.ToString())
                .WaitAsync(TimeSpan.FromSeconds(2));
        }
        catch (Exception ex) when (ex is RedisException or TimeoutException)
        {
            // A late Redis publish is safe: workers skip terminal failures. Never
            // report an unsuccessful request that could create a duplicate paid job.
            await db.AudioSessions.Where(s => s.Id == id && s.Status == "pending")
                .ExecuteUpdateAsync(u => u.SetProperty(s => s.Status, "failed").SetProperty(s => s.Stage, "failed")
                    .SetProperty(s => s.Error, "Could not queue audio generation. Create a new session when the service is available."), CancellationToken.None);
        }
    }

    private static IResult Existing(AudioSession session, CreateAudioSessionRequest request, IConfiguration config)
    {
        if ((session.ExamplesPerWord != 0 && (session.ExamplesPerWord != request.ExamplesPerWord
                || session.IncludeWordTranslation != request.IncludeWordTranslation
                || session.IncludeExampleTranslations != request.IncludeExampleTranslations))
            || !session.Words.OrderBy(w => w.Position).Select(w => w.WordId).SequenceEqual(request.WordIds))
            return Results.Conflict(new { error = "This request ID was already used with different settings." });
        return Results.Ok(Response(session, config));
    }

    private static Task<AudioSession?> ReadAsync(VocaCycleDbContext db, long id, CancellationToken token) =>
        db.AudioSessions.IgnoreQueryFilters().AsNoTracking().Include(s => s.Words).ThenInclude(w => w.Word)
            .SingleOrDefaultAsync(s => s.Id == id, token);

    private static object Response(AudioSession session, IConfiguration config)
    {
        var missing = session.Status == "ready" && !ArtifactsExist(config, session.Id);
        return new
        {
            session.Id, Mode = session.ExamplesPerWord == 0 ? "pairs" : "examples",
            Status = missing ? "failed" : session.Status, Stage = missing ? "failed" : session.Stage,
            Error = missing ? "The generated recording is missing from storage." : session.Error,
            session.CreatedAt, session.UpdatedAt, session.ExamplesPerWord, session.IncludeWordTranslation, session.IncludeExampleTranslations,
            AudioUrl = !missing && session.Status == "ready" ? session.AudioUrl : null,
            TimelineUrl = !missing && session.Status == "ready" ? $"/audio-sessions/{session.Id}/timeline" : null,
            DurationMs = !missing && session.Status == "ready" ? session.DurationMs : null,
            WordIds = session.Words.OrderBy(w => w.Position).Select(w => w.WordId),
            Words = session.Words.OrderBy(w => w.Position).Select(w => new { w.WordId, w.Word.Text, w.Word.Translation, w.Word.Ipa, w.Position })
        };
    }
    public static string? FilePath(IConfiguration config, long id, string file) =>
        id > 0 && !string.IsNullOrWhiteSpace(config["VOCACYCLE_STORAGE"])
            ? Path.GetFullPath(Path.Combine(config["VOCACYCLE_STORAGE"]!, "sessions", $"session-{id}", file)) : null;
    private static bool ArtifactsExist(IConfiguration config, long id) =>
        FilePath(config, id, "audio.mp3") is { } audio && File.Exists(audio)
        && FilePath(config, id, "timeline.json") is { } timeline && File.Exists(timeline);
}

using System.Text.Json;
using System.Buffers.Binary;
using Microsoft.EntityFrameworkCore;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Infrastructure.Models;

namespace VocaCycle.Worker.Services;

public sealed class AudioSessionProcessor(IDbContextFactory<VocaCycleDbContext> factory,
    SessionSpeechClient speech, SessionAudioAssembler assembler, IConfiguration configuration, ILogger<AudioSessionProcessor> logger)
{
    // A connection-scoped lock survives awaits and is released by PostgreSQL on a
    // worker crash. Reclaimed Redis deliveries cannot synthesize concurrently.
    public async Task<bool> ProcessAsync(long id, CancellationToken stoppingToken)
    {
        if (id <= 0) return true;
        await using var db = await factory.CreateDbContextAsync(stoppingToken);
        await db.Database.OpenConnectionAsync(stoppingToken);
        if (!await LockAsync(db, -id, false, stoppingToken)) return false;
        try
        {
            var session = await db.AudioSessions.IgnoreQueryFilters().Include(s => s.Words).ThenInclude(w => w.Word)
                .SingleOrDefaultAsync(s => s.Id == id, stoppingToken);
            if (session is null || session.Status is "ready" or "failed") return true;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            timeout.CancelAfter(TimeSpan.FromMinutes(30));
            var token = timeout.Token;
            try
            {
                if (session.RequestId is null) throw new SessionGenerationException("Legacy generation request: create a new session to generate audio.");
                if (session.ExamplesPerWord != 0)
                    throw new SessionGenerationException("Unfinished legacy example session: create a new Pairs session. Existing recordings are unchanged.");
                if (session.Words.Count is 0 or > 20) throw new InvalidDataException("Invalid session configuration.");
                // Validate the entire selection before the first paid request, including resumed jobs.
                var contents = new List<(AudioSessionWord Word, SessionWordContent Content)>();
                foreach (var word in session.Words.OrderBy(w => w.Position))
                {
                    if (word.Word.DeletedAt is not null || !SessionWordContent.IsValidPair(word.Word.Text, word.Word.Translation))
                        throw new SessionGenerationException($"Word {word.WordId} requires active English text and a stored Russian translation.");
                    var content = word.ContentJson is null
                        ? new SessionWordContent(word.Word.Text, word.Word.Translation!, [])
                        : JsonSerializer.Deserialize<SessionWordContent>(word.ContentJson);
                    if (content is null || content.Examples is not { Count: 0 }
                        || !SessionWordContent.IsValidPair(content.Word, content.Translation))
                        throw new InvalidDataException("Invalid Pairs content snapshot.");
                    word.ContentJson = JsonSerializer.Serialize(content);
                    contents.Add((word, content));
                }
                speech.ValidateConfiguration();
                await assembler.CheckAsync(token);
                var root = configuration["VOCACYCLE_STORAGE"];
                if (string.IsNullOrWhiteSpace(root) || !Path.IsPathFullyQualified(root)) throw new SessionGenerationException("Configure the same absolute audio storage path on the API and worker.");
                var directory = Path.Combine(Path.GetFullPath(root), "sessions", $"session-{id}");
                Directory.CreateDirectory(Path.Combine(directory, "parts"));
                session.Status = "processing"; session.Error = null;
                await StageAsync(db, session, "speech", token);
                var segments = new List<AudioTimelineEntry>();
                foreach (var (word, content) in contents)
                {
                    void Add(string kind, string text, string language) =>
                        segments.Add(new(word.WordId, word.Position, null, kind, text, language, 0, 0));
                    Add("word", content.Word, "en");
                    Add("recall-pause", "", "en");
                    Add("word-translation", content.Translation, "ru");
                    Add("transition", "", "ru");
                    Add("word-translation", content.Translation, "ru");
                    Add("recall-pause", "", "ru");
                    Add("word", content.Word, "en");
                }
                // Silence is PCM generated locally, never a TTS request.
                await assembler.SilenceAsync(Path.Combine(directory, "parts", "silence-2000.wav"), 2000, token);
                var normalized = new Dictionary<string, (string Path, long Duration)>();
                long elapsed = 0;
                for (var i = 0; i < segments.Count; i++)
                {
                    var segment = segments[i];
                    var wav = Path.Combine(directory, "parts", $"{i}.wav");
                    long duration;
                    if (segment.Kind is "recall-pause" or "transition")
                    {
                        duration = 2000;
                        File.Copy(Path.Combine(directory, "parts", $"silence-{duration}.wav"), wav, true);
                    }
                    else
                    {
                        // Imported pronunciation identity is word-local, not an ElevenLabs fingerprint.
                        var key = segment.Language == "en" ? $"pronunciation:{segment.WordId}" : speech.CacheKey(segment.Text, segment.Language);
                        if (!normalized.TryGetValue(key, out var ready))
                        {
                            var pronunciationDuration = segment.Language == "en"
                                ? await TryNormalizePronunciationAsync(root, session.Words.Single(w => w.WordId == segment.WordId).Word,
                                    segment.Text, wav, token)
                                : null;
                            if (pronunciationDuration is { } existingDuration) duration = existingDuration;
                            else
                            {
                                var speechKey = speech.CacheKey(segment.Text, segment.Language);
                                var mp3 = await CachedSpeechAsync(db, root, session.Id, segment.Text, segment.Language, speechKey, token);
                                duration = await assembler.NormalizeAsync(mp3, wav, token, trailingSilenceSeconds: 0);
                            }
                            normalized.Add(key, (wav, duration));
                        }
                        else
                        {
                            File.Copy(ready.Path, wav, true);
                            duration = ready.Duration;
                        }
                    }
                    segments[i] = segments[i] with { StartMs = elapsed, EndMs = elapsed + duration };
                    elapsed += duration;
                }
                await StageAsync(db, session, "assembly", token);
                var total = await assembler.AssembleAsync(directory, segments.Count, token);
                var timeline = JsonSerializer.Serialize(segments, new JsonSerializerOptions(JsonSerializerDefaults.Web));
                await File.WriteAllTextAsync(Path.Combine(directory, "timeline.tmp.json"), timeline, token);
                File.Move(Path.Combine(directory, "timeline.tmp.json"), Path.Combine(directory, "timeline.json"), true);
                session.AudioUrl = $"/audio-sessions/{id}/audio";
                session.DurationMs = total; session.TimelineJson = timeline; session.Status = "ready";
                await StageAsync(db, session, "ready", token);
            }
            catch (Exception ex)
            {
                session.Status = "failed";
                session.Error = ex is SessionGenerationException ? ex.Message : ex switch
                {
                    OperationCanceledException => "Audio generation was interrupted or exceeded its time limit.",
                    InvalidDataException or JsonException => "Generation returned invalid Pairs content or audio. No automatic paid retry was made.",
                    _ => "Audio generation failed. Check worker configuration and logs before creating a new session."
                };
                logger.LogWarning(
                    "AudioSession {SessionId} failed ({Category}): {Reason}",
                    id,
                    ex.GetType().Name,
                    ex is SessionGenerationException or InvalidDataException ? ex.Message : "See exception category; provider bodies and configuration are omitted.");
                await StageAsync(db, session, "failed", CancellationToken.None);
            }
            return true;
        }
        finally { await UnlockAsync(db, -id); }
    }

    private async Task<long?> TryNormalizePronunciationAsync(string root, Word word, string text, string wav, CancellationToken token)
    {
        // Only the API's own canonical reference is eligible; never fetch arbitrary URLs or paths.
        if (word.Text != text || word.PronunciationAudioUrl != $"/words/{word.Id}/pronunciation") return null;
        try
        {
            var directory = Path.Combine(Path.GetFullPath(root), "pronunciations");
            var path = Path.Combine(directory, $"word-{word.Id}.mp3");
            // Both descendants must be ordinary local entries, not links escaping storage.
            if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0
                || (File.GetAttributes(path) & (FileAttributes.ReparsePoint | FileAttributes.Directory)) != 0) return null;
            await using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
            if (input.Length is < 3 or > 2_097_152) return null;
            var bytes = new byte[(int)input.Length];
            await input.ReadExactlyAsync(bytes, token);
            if (!(bytes[0] == 'I' && bytes[1] == 'D' && bytes[2] == '3'
                || bytes[0] == 0xff && (bytes[1] & 0xe0) == 0xe0)) return null;
            // Snapshot before FFmpeg so deletion/replacement cannot change the session's input.
            // This copy stays in session storage, never in the ElevenLabs speech cache.
            var copy = Path.Combine(Path.GetDirectoryName(wav)!, $"pronunciation-{word.Id}.mp3");
            await File.WriteAllBytesAsync(copy, bytes, token);
            return await assembler.NormalizeAsync(copy, wav, token, trailingSilenceSeconds: 0);
        }
        catch (Exception ex) when (!token.IsCancellationRequested
            && ex is IOException or UnauthorizedAccessException or InvalidDataException or SessionGenerationException
                or System.Text.Json.JsonException or FormatException or OverflowException)
        {
            logger.LogInformation("Word {WordId} pronunciation could not be reused ({Category}); using the speech cache.",
                word.Id, ex.GetType().Name);
            return null;
        }
    }

    private async Task<string> CachedSpeechAsync(VocaCycleDbContext db, string root, long sessionId,
        string text, string language, string key, CancellationToken token)
    {
        // A separate two-int PostgreSQL lock namespace serializes cache access across workers.
        // Hash collisions only serialize unrelated segments; full SHA-256 keys identify files.
        var lockKey = BinaryPrimitives.ReadInt32BigEndian(Convert.FromHexString(key));
        await CacheLockAsync(db, lockKey, false, token);
        try
        {
            var cache = Path.Combine(root, "speech-segments");
            Directory.CreateDirectory(cache);
            var path = Path.Combine(cache, key + ".mp3");
            if (File.Exists(path))
            {
                await using var input = File.OpenRead(path);
                var header = new byte[3];
                if (input.Length is < 3 or > 2_097_152 || await input.ReadAsync(header, token) != 3
                    || !(header[0] == 'I' && header[1] == 'D' && header[2] == '3'
                        || header[0] == 0xff && (header[1] & 0xe0) == 0xe0))
                    throw new InvalidDataException("Cached speech is invalid; automatic paid regeneration was prevented.");
                return path;
            }
            var claim = Path.Combine(cache, key + ".claim");
            if (File.Exists(claim))
                throw new SessionGenerationException("A cached speech request was already attempted without a saved recording. Automatic paid retry was prevented; inspect the speech cache before manual recovery.");
            // Persist and flush BEFORE sending the paid request. Never remove a claim automatically.
            using (var checkpoint = new FileStream(claim, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                checkpoint.Write(System.Text.Encoding.UTF8.GetBytes($"session:{sessionId}"));
                checkpoint.Flush(flushToDisk: true);
            }
            var bytes = await speech.SynthesizeAsync(text, language, token);
            var temporary = path + ".tmp";
            await using (var output = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                await output.WriteAsync(bytes, token);
                output.Flush(flushToDisk: true);
            }
            File.Move(temporary, path);
            return path;
        }
        finally { await CacheLockAsync(db, lockKey, true, CancellationToken.None); }
    }
    private static async Task CacheLockAsync(VocaCycleDbContext db, int key, bool unlock, CancellationToken token)
    {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = unlock ? "SELECT pg_advisory_unlock(1448035137, @key)" : "SELECT pg_advisory_lock(1448035137, @key)";
        command.CommandTimeout = 180;
        var parameter = command.CreateParameter(); parameter.ParameterName = "key"; parameter.Value = key;
        command.Parameters.Add(parameter);
        await command.ExecuteScalarAsync(token);
    }
    private static async Task StageAsync(VocaCycleDbContext db, AudioSession session, string stage, CancellationToken token)
    {
        session.Stage = stage; session.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(token);
    }
    private static async Task<bool> LockAsync(VocaCycleDbContext db, long key, bool wait, CancellationToken token)
    {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = wait ? "SELECT pg_advisory_lock(@key)" : "SELECT pg_try_advisory_lock(@key)";
        command.CommandTimeout = 180;
        var parameter = command.CreateParameter(); parameter.ParameterName = "key"; parameter.Value = key; command.Parameters.Add(parameter);
        var value = await command.ExecuteScalarAsync(token);
        return wait || value is true;
    }
    private static async Task UnlockAsync(VocaCycleDbContext db, long key)
    {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = "SELECT pg_advisory_unlock(@key)";
        var parameter = command.CreateParameter(); parameter.ParameterName = "key"; parameter.Value = key; command.Parameters.Add(parameter);
        await command.ExecuteScalarAsync();
    }
}

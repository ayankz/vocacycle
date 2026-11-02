using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using VocaCycle.Infrastructure.Data;

namespace VocaCycle.Worker.Services;

public sealed class PronunciationService(
    IDbContextFactory<VocaCycleDbContext> dbFactory,
    DictionaryIpaClient dictionary,
    PronunciationAudioClient audio,
    IConfiguration configuration,
    ILogger<PronunciationService> logger)
{
    public async Task<bool> ProcessAsync(long wordId, CancellationToken cancellationToken)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var word = await db.Words.AsNoTracking().FirstOrDefaultAsync(w => w.Id == wordId, cancellationToken);
        if (word is null) return true;
        var root = configuration["VOCACYCLE_STORAGE"];
        if (!string.IsNullOrWhiteSpace(root) && !string.IsNullOrWhiteSpace(word.Ipa)
            && word.PronunciationAudioUrl == $"/words/{wordId}/pronunciation")
        {
            var existing = Path.Combine(root, "pronunciations", $"word-{wordId}.mp3");
            if (File.Exists(existing) && new FileInfo(existing).Length > 0) return true;
        }
        // IPA enrichment must work even when audio storage/configuration is unavailable.
        var result = word.DictionaryPronunciation is null ? null
            : JsonSerializer.Deserialize<DictionaryPronunciation>(word.DictionaryPronunciation);
        if (result is null)
        {
            result = await dictionary.LookupPronunciationAsync(word.Text, cancellationToken);
            var checkpoint = JsonSerializer.Serialize(result);
            await db.Words.Where(w => w.Id == wordId && w.DictionaryPronunciation == null)
                .ExecuteUpdateAsync(u => u.SetProperty(w => w.DictionaryPronunciation, checkpoint)
                    .SetProperty(w => w.Ipa, w => w.Ipa == null || w.Ipa.Trim() == "" ? result.Ipa : w.Ipa), cancellationToken);
            // A concurrent delivery may have won. Use its durable selection.
            word = await db.Words.AsNoTracking().FirstOrDefaultAsync(w => w.Id == wordId, cancellationToken);
            if (word is null) return true;
            result = JsonSerializer.Deserialize<DictionaryPronunciation>(word.DictionaryPronunciation!)!;
        }
        if (string.IsNullOrWhiteSpace(root))
        {
            logger.LogWarning("Pronunciation unavailable: VOCACYCLE_STORAGE is not configured.");
            return true;
        }
        var filename = $"word-{wordId}.mp3";
        var directory = Path.Combine(root, "pronunciations");
        var path = Path.Combine(directory, filename);
        var reference = $"/words/{wordId}/pronunciation";
        if (word.PronunciationAudioUrl == reference && File.Exists(path) && new FileInfo(path).Length > 0) return true;
        Directory.CreateDirectory(directory);
        // Recover a completed atomic write after a crash before the database update.
        if (!File.Exists(path) || new FileInfo(path).Length == 0)
        {
            byte[] bytes;
            if (result.AudioUrl is not null)
            {
                // A failed download remains a dictionary failure; never switches to paid TTS.
                bytes = await audio.DownloadDictionaryAsync(result.AudioUrl, cancellationToken);
            }
            else
            {
                if (word.PronunciationSynthesisAttempted) return true;
                // Saved vocabulary can contain phrases; synthesize only a single English word.
                if (!Regex.IsMatch(word.Text, @"^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$") || word.Text.Length > 80)
                {
                    logger.LogWarning("Word {WordId} is not eligible for word-only synthesis.", wordId);
                    return true;
                }
                if (!audio.IsConfigured(out var diagnostic))
                {
                    logger.LogWarning("Pronunciation unavailable: {Diagnostic}", diagnostic);
                    return true;
                }
                // Conditional database claim is durable BEFORE sending any paid request.
                // Deliberately never reset automatically, including timeout/crash/cancellation.
                var claimed = await db.Words.Where(w => w.Id == wordId && !w.PronunciationSynthesisAttempted)
                    .ExecuteUpdateAsync(u => u.SetProperty(w => w.PronunciationSynthesisAttempted, true), cancellationToken);
                if (claimed == 0) return true;
                bytes = await audio.SynthesizeAsync(word.Text, cancellationToken);
            }
            var temporary = Path.Combine(directory, $".{filename}.{Guid.NewGuid():N}.tmp");
            try
            {
                await File.WriteAllBytesAsync(temporary, bytes, cancellationToken);
                File.Move(temporary, path, overwrite: true);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
        await db.Words.Where(w => w.Id == wordId)
            .ExecuteUpdateAsync(u => u.SetProperty(w => w.PronunciationAudioUrl, reference), cancellationToken);
        return true;
    }
}

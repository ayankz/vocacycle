using Microsoft.EntityFrameworkCore;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Infrastructure.Models;

namespace VocaCycle.Infrastructure.Services;

public static class WordDeletion
{
    // Shared by DELETE and final pronunciation publication. No network/provider
    // work runs under this short row lock; deleted words cannot be resurrected.
    public static Task<Word?> LockAsync(VocaCycleDbContext db, long id, CancellationToken token) =>
        db.Words.FromSqlInterpolated($"SELECT * FROM \"Words\" WHERE \"Id\" = {id} FOR UPDATE")
            .IgnoreQueryFilters().FirstOrDefaultAsync(token);

    public static async Task DeleteAsync(VocaCycleDbContext db, long id, string? storage, CancellationToken token)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        var word = await LockAsync(db, id, token);
        if (word is null) return; // DELETE is idempotent, including a lost response.
        if (string.IsNullOrWhiteSpace(storage) && word.PronunciationAudioUrl is not null)
            throw new IOException("Pronunciation storage is not configured.");
        word.DeletedAt ??= DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(token);
        if (!string.IsNullOrWhiteSpace(storage))
            File.Delete(Path.Combine(storage, "pronunciations", $"word-{id}.mp3"));
        await transaction.CommitAsync(token);
        // Keep session links, text, translations and examples as historical data.
        // Session WAVs/continuous recordings are never removed here.
    }
}

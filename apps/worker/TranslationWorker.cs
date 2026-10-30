using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Worker.Services;

namespace VocaCycle.Worker;

public sealed class TranslationWorker(
    IConnectionMultiplexer connection,
    IDbContextFactory<VocaCycleDbContext> dbFactory,
    IWordTranslator translator,
    ILogger<TranslationWorker> logger) : BackgroundService
{
    private const string Stream = "vocacycle:translation:jobs";
    private const string Group = "translation-workers";
    private const int MaxDeliveries = 3;
    private readonly string _consumer = $"translation-{Environment.MachineName}-{Guid.NewGuid():N}";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var redis = connection.GetDatabase();
        var claimCursor = (RedisValue)"0-0";
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                try
                {
                    // Start at zero so jobs published before startup are included.
                    await redis.StreamCreateConsumerGroupAsync(Stream, Group, "0-0", createStream: true);
                }
                catch (RedisServerException ex) when (ex.Message.StartsWith("BUSYGROUP")) { }

                var claimed = await redis.StreamAutoClaimAsync(
                    Stream, Group, _consumer, 60_000, claimCursor, count: 1);
                claimCursor = claimed.NextStartId;
                var messages = claimed.ClaimedEntries.Length > 0
                    ? claimed.ClaimedEntries
                    : await redis.StreamReadGroupAsync(Stream, Group, _consumer, ">", count: 1);

                foreach (var message in messages)
                    await ProcessMessageAsync(redis, message, stoppingToken);

                await Task.Delay(1000, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Do not log provider response bodies or credentials.
                logger.LogWarning("Translation consumer failed ({ErrorType}); retrying in 5 seconds.", ex.GetType().Name);
                try { await Task.Delay(5000, stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            }
        }
    }

    private async Task ProcessMessageAsync(IDatabase redis, StreamEntry message, CancellationToken stoppingToken)
    {
        var value = message.Values.FirstOrDefault(field => field.Name == "wordId").Value;
        if (!long.TryParse(value.ToString(), out var wordId) || wordId <= 0)
        {
            logger.LogWarning("Discarding invalid translation message {MessageId}.", message.Id);
            await redis.StreamAcknowledgeAsync(Stream, Group, message.Id);
            return;
        }

        // Redis maintains this count across crashes, reclaiming and worker restarts.
        var pending = await redis.StreamPendingMessagesAsync(
            Stream, Group, 1, _consumer, message.Id, message.Id);
        var deliveries = pending.Single().DeliveryCount;
        if (deliveries > MaxDeliveries)
        {
            logger.LogWarning("Translation attempts exhausted for Word {WordId}.", wordId);
            await redis.StreamAcknowledgeAsync(Stream, Group, message.Id);
            return;
        }

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            await using var db = await dbFactory.CreateDbContextAsync(timeout.Token);
            var word = await db.Words.AsNoTracking().FirstOrDefaultAsync(w => w.Id == wordId, timeout.Token);
            if (word is not null && string.IsNullOrWhiteSpace(word.Translation))
            {
                var translation = await translator.TranslateAsync(word.Text, timeout.Token);
                // Do not overwrite a translation written while the HTTP request was running.
                await db.Words.Where(w => w.Id == wordId && (w.Translation == null || w.Translation.Trim() == ""))
                    .ExecuteUpdateAsync(update => update.SetProperty(w => w.Translation, translation), timeout.Token);
                logger.LogInformation("Saved translation for Word {WordId}.", wordId);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            logger.LogWarning("Translation attempt {Attempt}/{MaxAttempts} failed for Word {WordId} ({ErrorType}).",
                deliveries, MaxDeliveries, wordId, ex.GetType().Name);
            if (deliveries < MaxDeliveries) return; // Leave pending for reclaim after 60 seconds.
        }

        await redis.StreamAcknowledgeAsync(Stream, Group, message.Id);
    }
}

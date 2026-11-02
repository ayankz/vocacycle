using StackExchange.Redis;
using VocaCycle.Worker.Services;

namespace VocaCycle.Worker;

public sealed class PronunciationWorker(
    IConnectionMultiplexer connection,
    PronunciationService pronunciation,
    ILogger<PronunciationWorker> logger) : BackgroundService
{
    private const string Stream = "vocacycle:translation:jobs";
    private const string Group = "pronunciation-workers";
    private const int MaxDeliveries = 3;
    private readonly string _consumer = $"pronunciation-{Environment.MachineName}-{Guid.NewGuid():N}";

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
                logger.LogWarning("Pronunciation consumer failed ({ErrorType}); retrying in 5 seconds.", ex.GetType().Name);
                try { await Task.Delay(5000, stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            }
        }
    }

    private async Task ProcessMessageAsync(IDatabase redis, StreamEntry message, CancellationToken stoppingToken)
    {
        // Old retained enrichment entries predate pronunciation. Do not backfill paid
        // synthesis automatically when this consumer group is first deployed.
        if (!message.Values.Any(field => field.Name == "pronunciation" && field.Value == "1"))
        {
            await redis.StreamAcknowledgeAsync(Stream, Group, message.Id);
            return;
        }
        var value = message.Values.FirstOrDefault(field => field.Name == "wordId").Value;
        if (!long.TryParse(value.ToString(), out var wordId) || wordId <= 0)
        {
            logger.LogWarning("Discarding invalid pronunciation message {MessageId}.", message.Id);
            await redis.StreamAcknowledgeAsync(Stream, Group, message.Id);
            return;
        }

        // Redis maintains this count across crashes, reclaiming and worker restarts.
        var pending = await redis.StreamPendingMessagesAsync(
            Stream, Group, 1, _consumer, message.Id, message.Id);
        var deliveries = pending.Single().DeliveryCount;
        if (deliveries > MaxDeliveries)
        {
            logger.LogWarning("Pronunciation attempts exhausted for Word {WordId}.", wordId);
            await redis.StreamAcknowledgeAsync(Stream, Group, message.Id);
            return;
        }

        var pronunciationComplete = await AttemptAsync();
        if (!pronunciationComplete && deliveries < MaxDeliveries) return;
        if (!pronunciationComplete)
            logger.LogWarning("Pronunciation attempts exhausted for Word {WordId}.", wordId);
        await redis.StreamAcknowledgeAsync(Stream, Group, message.Id);

        async Task<bool> AttemptAsync()
        {
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                timeout.CancelAfter(TimeSpan.FromSeconds(40));
                return await pronunciation.ProcessAsync(wordId, timeout.Token);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { throw; }
            catch (PronunciationSynthesisException ex)
            {
                logger.LogWarning("Pronunciation synthesis unavailable for Word {WordId} ({Category}); automatic paid retry suppressed.", wordId, ex.Message);
                return true;
            }
            catch (Exception ex)
            {
                logger.LogWarning("{Enrichment} attempt {Attempt}/{MaxAttempts} failed for Word {WordId} ({ErrorType}).",
                    "Pronunciation", deliveries, MaxDeliveries, wordId, ex.GetType().Name);
                return false;
            }
        }
    }
}

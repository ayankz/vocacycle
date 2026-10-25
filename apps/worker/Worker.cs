using StackExchange.Redis;
using VocaCycle.Worker.Services;

namespace VocaCycle.Worker;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly IDatabase _redis;
    private readonly AudioSessionProcessor _processor;

    public Worker(
        ILogger<Worker> logger,
        IConnectionMultiplexer connection,
        AudioSessionProcessor processor)

    {
        _logger = logger;
        _redis = connection.GetDatabase();
        _processor = processor;
    }

    protected override async Task ExecuteAsync(

        CancellationToken stoppingToken)
    {
        const string stream = "vocacycle:audio:jobs";
        const string group = "audio-workers";
        const string consumer = "dotnet-worker-1";
        const int retryIdleTimeMs = 60_000;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var claimed = await _redis.StreamAutoClaimAsync(
                    stream,
                    group,
                    consumer,
                    retryIdleTimeMs,
                    "0-0",
                    count: 1
            );
                StreamEntry[] messagesToProcess;

                if (claimed.ClaimedEntries.Length > 0)
                {
                    messagesToProcess = claimed.ClaimedEntries;
                }
                else
                {
                    messagesToProcess = await _redis.StreamReadGroupAsync(
                        stream, group, consumer, ">", count: 1);
                }

                foreach (var message in messagesToProcess)
                {
                    foreach (var field in message.Values)
                    {
                        _logger.LogInformation(
                            "Received: {Name} = {Value}",
                            field.Name,
                            field.Value);
                    }
                    var sessionIdValue = message.Values
                        .FirstOrDefault(x => x.Name == "sessionId")
                         .Value;

                    if (!long.TryParse(sessionIdValue.ToString(), out var sessionId))
                    {
                        _logger.LogWarning(
                            "Invalid sessionId in message: {MessageId}",
                            message.Id);

                        await _redis.StreamAcknowledgeAsync(
                            stream, group, message.Id);

                        continue;
                    }
                    try
                    {
                        await _processor.ProcessAsync(sessionId, stoppingToken);
                        await _redis.StreamAcknowledgeAsync(stream, group, message.Id);
                        _logger.LogInformation("Acknowledged message: {MessageId}", message.Id);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        throw;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(
                            ex,
                            "Failed to process AudioSession {SessionId}. Message {MessageId} remains pending.",
                            sessionId,
                            message.Id);
                    }


                }
                await Task.Delay(1000, stoppingToken);
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (RedisException ex)
            {
                _logger.LogError(
                    ex,
                    "Redis operation failed. Retrying in 5 seconds.");

                await Task.Delay(5000, stoppingToken);
            }
        }
    }
}
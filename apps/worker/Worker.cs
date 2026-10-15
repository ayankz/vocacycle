using StackExchange.Redis;

namespace VocaCycle.Worker;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly IDatabase _redis;

    public Worker(
        ILogger<Worker> logger,
        IConnectionMultiplexer connection)
    {
        _logger = logger;
        _redis = connection.GetDatabase();
    }

    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        const string stream = "vocacycle:audio:jobs";
        const string group = "audio-workers";
        const string consumer = "dotnet-worker-1";

        while (!stoppingToken.IsCancellationRequested)
        {
            var messages = await _redis.StreamReadGroupAsync(
                stream,
                group,
                consumer,
                ">",
                count: 1
            );
            foreach (var message in messages)
            {
                foreach (var field in message.Values)
                {
                    _logger.LogInformation(
                        "Received: {Name} = {Value}",
                        field.Name,
                        field.Value);
                }
                await _redis.StreamAcknowledgeAsync(
            stream,
            group,
            message.Id
        );

                _logger.LogInformation(
                    "Acknowledged message: {MessageId}",
                    message.Id);
            }
        }
    }
}
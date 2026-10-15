using VocaCycle.Worker;
using StackExchange.Redis;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect("localhost:6379")
);
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();

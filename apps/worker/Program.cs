using VocaCycle.Worker;
using StackExchange.Redis;
using Microsoft.EntityFrameworkCore;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Worker.Services;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect("localhost:6379")
);

builder.Services.AddDbContextFactory<VocaCycleDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection")
    )
);
builder.Services.AddHttpClient("Ollama", client =>
{
    client.BaseAddress = new Uri("http://localhost:11434");
    client.Timeout = TimeSpan.FromMinutes(3);
});
builder.Services.AddHttpClient("Tts", client =>
{
    client.BaseAddress = new Uri("http://127.0.0.1:8001");
    client.Timeout = TimeSpan.FromMinutes(10);
});
builder.Services.AddSingleton<ExampleGenerationService>();
builder.Services.AddSingleton<AudioSessionProcessor>();
builder.Services.AddHostedService<Worker>();
builder.Services.AddSingleton<TtsService>();

var host = builder.Build();
host.Run();

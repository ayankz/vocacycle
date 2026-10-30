using VocaCycle.Worker;
using StackExchange.Redis;
using Microsoft.EntityFrameworkCore;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Worker.Services;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
{
    var options = ConfigurationOptions.Parse(
        builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379");
    options.AbortOnConnectFail = false;
    return ConnectionMultiplexer.Connect(options);
});

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
// Independent hosted loop: slow translation requests cannot block audio jobs.
builder.Services.AddHostedService<TranslationWorker>();
var translationProvider = builder.Configuration["Translation:Provider"]
    ?? (builder.Environment.IsDevelopment() ? "Ollama" : "Google");
switch (translationProvider.Trim().ToLowerInvariant())
{
    case "ollama":
        builder.Services.AddTransient<IWordTranslator, OllamaWordTranslator>();
        break;
    case "google":
        builder.Services.AddHttpClient<IWordTranslator, GoogleWordTranslator>(client =>
        {
            client.BaseAddress = new Uri("https://translation.googleapis.com/");
            client.Timeout = TimeSpan.FromSeconds(5);
        }).RedactLoggedHeaders(new[] { "x-goog-api-key" });
        break;
    default:
        throw new InvalidOperationException("Translation:Provider must be Ollama or Google.");
}
builder.Services.AddSingleton<TtsService>();

var host = builder.Build();
host.Run();

using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using StackExchange.Redis;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Infrastructure.Models;
using VocaCycle.Worker.Services;

static void Check(bool condition, string message) { if (!condition) throw new Exception(message); Console.WriteLine("PASS " + message); }
static async Task<string> Run(string executable, params string[] arguments)
{
    var start = new ProcessStartInfo(executable) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
    foreach (var arg in arguments) start.ArgumentList.Add(arg);
    using var process = Process.Start(start)!;
    var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync();
    if (process.ExitCode != 0) throw new Exception(await error);
    return await output;
}
static int Port() { var socket = new TcpListener(IPAddress.Loopback, 0); socket.Start(); var port = ((IPEndPoint)socket.LocalEndpoint).Port; socket.Stop(); return port; }
var admin = Environment.GetEnvironmentVariable("AUDIO_SESSION_TEST_ADMIN")
    ?? throw new InvalidOperationException("Set AUDIO_SESSION_TEST_ADMIN to permit a new disposable test database. Providers are HTTP stubs only.");
var name = "vocacycle_audio_test_" + Guid.NewGuid().ToString("N");
var root = Path.Combine(Path.GetTempPath(), name); Directory.CreateDirectory(root);
var container = "vocacycle-audio-check-" + Guid.NewGuid().ToString("N");
var dbConnection = new NpgsqlConnectionStringBuilder(admin) { Database = name }.ConnectionString;
await using var adminConnection = new NpgsqlConnection(admin); await adminConnection.OpenAsync();
await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", adminConnection)) await create.ExecuteNonQueryAsync();
Process? api = null; VocaCycle.Worker.Worker? worker = null; ConnectionMultiplexer? redis = null;
try
{
    var redisPort = Port();
    await Run("docker", "run", "-d", "--rm", "--name", container, "-p", $"127.0.0.1:{redisPort}:6379", "redis:7-alpine");
    redis = await ConnectionMultiplexer.ConnectAsync($"127.0.0.1:{redisPort},abortConnect=false,connectRetry=10,connectTimeout=3000");
    await redis.GetDatabase().PingAsync();
    var factory = new Factory(new DbContextOptionsBuilder<VocaCycleDbContext>().UseNpgsql(dbConnection).Options);
    await using var db = factory.CreateDbContext();
    await db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>().MigrateAsync("20261103065551_AddWordCreatedAt");
    await db.Database.ExecuteSqlRawAsync("""INSERT INTO "AudioSessions" ("Status", "CreatedAt", "IncludeWordTranslation", "IncludeExampleTranslations") VALUES ('pending', '2026-01-01T00:00:00Z', true, false)""");
    await db.Database.MigrateAsync();
    var legacy = await db.AudioSessions.SingleAsync();
    Check(legacy.ExamplesPerWord == 5 && legacy.UpdatedAt == legacy.CreatedAt && legacy.Stage == "queued" && legacy.RequestId == null,
        "migration preserves legacy sessions with five examples and their real creation timestamp");
    Check(!db.Database.HasPendingModelChanges(), "session migration matches model");
    var bike = new Word { Text = "bike" }; var glasses = new Word { Text = "glasses" };
    db.AddRange(bike, glasses); await db.SaveChangesAsync();
    var sample = Path.Combine(root, "sample.mp3");
    await Run("ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.12", "-c:a", "libmp3lame", sample);
    var audioBytes = await File.ReadAllBytesAsync(sample);
    var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
        ["VOCACYCLE_STORAGE"] = root, ["ElevenLabs:ApiKey"] = "fixture-only", ["ElevenLabs:VoiceId"] = "fixture-voice", ["ElevenLabs:ModelId"] = "fixture-model"
    }).Build();
    var paidCalls = 0; var exampleCalls = 0; var rejectSpeech = false; var malformed = false;
    var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var clients = new Clients(async (client, request, token) => {
        if (client == "Ollama")
        {
            Interlocked.Increment(ref exampleCalls);
            using var payload = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
            var count = payload.RootElement.GetProperty("format").GetProperty("properties").GetProperty("examples").GetProperty("minItems").GetInt32();
            using var prompt = JsonDocument.Parse(payload.RootElement.GetProperty("prompt").GetString()!);
            var word = prompt.RootElement.GetProperty("word").GetString()!;
            var output = JsonSerializer.Serialize(new { translation = "велосипед", examples = Enumerable.Range(1, malformed ? count - 1 : count).Select(i => new { text = $"We use {word} at home today {i}.", translation = "Мы используем это дома каждый день." }) });
            return new(HttpStatusCode.OK) { Content = JsonContent.Create(new { done = true, done_reason = "stop", response = output }) };
        }
        Check(client == "SessionElevenLabs", "only the stubbed speech client is used");
        var call = Interlocked.Increment(ref paidCalls);
        if (call == 1) { entered.TrySetResult(); await release.Task.WaitAsync(token); }
        using var speech = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
        Check(speech.RootElement.GetProperty("language_code").GetString() is "en" or "ru", "explicit speech language");
        if (rejectSpeech) return new(HttpStatusCode.TooManyRequests);
        var content = new ByteArrayContent(audioBytes); content.Headers.ContentType = new("audio/mpeg");
        return new(HttpStatusCode.OK) { Content = content };
    });
    // Reject structurally plausible but unusable model output before speech.
    var validExamples = Enumerable.Range(1, 5).Select(i => new { text = $"We use bike at home today {i}.", translation = "Мы используем велосипед каждый день." }).ToArray();
    foreach (var invalidOutput in new[] {
        JsonSerializer.Serialize(new { translation = "English", examples = validExamples }),
        JsonSerializer.Serialize(new { translation = "велосипед", examples = validExamples.Take(4) }),
        JsonSerializer.Serialize(new { translation = "велосипед", examples = Enumerable.Repeat(validExamples[0], 5) }),
        JsonSerializer.Serialize(new { translation = "велосипед", examples = validExamples, extra = "unexpected" }),
        JsonSerializer.Serialize(new { translation = "велосипед", examples = Enumerable.Range(0,5).Select(i => new { text = "This example omits the target.", translation = "В этом примере нет слова." }) })
    })
    {
        var invalidClients = new Clients((_, _, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { done = true, done_reason = "stop", response = invalidOutput }) }));
        try { await new ExampleGenerationService(invalidClients, config).GenerateAsync("bike", 5, default); throw new Exception("Invalid output accepted"); }
        catch (InvalidDataException) { }
    }
    Check(paidCalls == 0, "wrong-language/count/duplicate/extra-field/missing-word model outputs are rejected without TTS");
    var generator = new ExampleGenerationService(clients, config);
    var assembler = new SessionAudioAssembler(config);
    var processor = new AudioSessionProcessor(generator, factory, new SessionSpeechClient(clients, config), assembler, config, NullLogger<AudioSessionProcessor>.Instance);
    worker = new VocaCycle.Worker.Worker(NullLogger<VocaCycle.Worker.Worker>.Instance, redis, processor);
    await worker.StartAsync(default);
    var repo = Directory.GetCurrentDirectory(); while (!File.Exists(Path.Combine(repo, "VocaCycle.slnx"))) repo = Directory.GetParent(repo)!.FullName;
    var apiPort = Port();
    var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
    start.ArgumentList.Add(Path.Combine(repo, "apps/api/bin/Debug/net10.0/VocaCycle.Api.dll")); start.ArgumentList.Add("--urls"); start.ArgumentList.Add($"http://127.0.0.1:{apiPort}");
    start.Environment["ConnectionStrings__DefaultConnection"] = dbConnection; start.Environment["ConnectionStrings__Redis"] = $"127.0.0.1:{redisPort}"; start.Environment["VOCACYCLE_STORAGE"] = root;
    api = Process.Start(start)!; api.BeginOutputReadLine(); api.BeginErrorReadLine();
    using var http = new HttpClient { BaseAddress = new($"http://127.0.0.1:{apiPort}"), Timeout = TimeSpan.FromSeconds(10) };
    for (var i = 0; i < 60; i++) { try { if ((await http.GetAsync("/health")).IsSuccessStatusCode) break; } catch (HttpRequestException) { } await Task.Delay(100); }
    async Task<JsonElement> Get(long id) => JsonDocument.Parse(await http.GetStringAsync($"/audio-sessions/{id}")).RootElement.Clone();
    async Task<JsonElement> Wait(long id)
    {
        for (var i = 0; i < 600; i++) { var s = await Get(id); if (s.GetProperty("status").GetString() is "ready" or "failed") return s; await Task.Delay(100); }
        throw new Exception("Generation did not reach a terminal status.");
    }
    async Task<long> Create(long[] ids, int count, bool wordTranslation, bool exampleTranslation, Guid key)
    {
        using var response = await http.PostAsJsonAsync("/audio-sessions", new { wordIds = ids, examplesPerWord = count, includeWordTranslation = wordTranslation, includeExampleTranslations = exampleTranslation, requestId = key });
        Check(response.IsSuccessStatusCode, "create session accepted");
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt64();
    }
    var requestId = Guid.NewGuid();
    var id = await Create([bike.Id, glasses.Id], 5, true, true, requestId);
    await entered.Task.WaitAsync(TimeSpan.FromSeconds(15));
    Check(await Create([bike.Id, glasses.Id], 5, true, true, requestId) == id, "repeated POST recovers the same session without duplicate jobs");
    Check(!await processor.ProcessAsync(id, default), "a reclaimed delivery cannot acquire the active session lock");
    release.SetResult();
    var ready = await Wait(id);
    Check(ready.GetProperty("status").GetString() == "ready", "API → Redis → worker → stub providers → FFmpeg reaches Ready");
    Check(paidCalls == 24, "two words with both translations use exactly 24 speech segments");
    var timeline = await http.GetFromJsonAsync<List<AudioTimelineEntry>>($"/audio-sessions/{id}/timeline", new JsonSerializerOptions(JsonSerializerDefaults.Web));
    Check(timeline!.Count == 24 && timeline.First().StartMs == 0 && timeline.Zip(timeline.Skip(1)).All(p => p.First.EndMs == p.Second.StartMs), "timeline is contiguous and ordered");
    Check(timeline[0].Kind == "word" && timeline[1].Kind == "word-translation" && timeline[2].Kind == "example" && timeline[3].Kind == "example-translation", "English/Russian segment order is correct");
    Check(Math.Abs(timeline.Last().EndMs - ready.GetProperty("durationMs").GetInt64()) < 100, "timeline matches measured continuous recording duration");
    using var rangeRequest = new HttpRequestMessage(HttpMethod.Get, $"/audio-sessions/{id}/audio"); rangeRequest.Headers.Range = new(0, 31);
    using var range = await http.SendAsync(rangeRequest);
    Check(range.StatusCode == HttpStatusCode.PartialContent && (await range.Content.ReadAsByteArrayAsync()).Length == 32, "ready MP3 supports range playback");
    Check(await processor.ProcessAsync(id, default) && paidCalls == 24, "duplicate ready delivery never repeats paid synthesis");
    foreach (var count in new[] { 6, 7 })
    {
        var other = await Create([bike.Id], count, count == 7, false, Guid.NewGuid());
        var state = await Wait(other); Check(state.GetProperty("status").GetString() == "ready", $"{count} examples supported");
        var entries = await http.GetFromJsonAsync<List<AudioTimelineEntry>>($"/audio-sessions/{other}/timeline", new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Check(entries!.Count == 1 + count + (count == 7 ? 1 : 0) && entries.All(e => e.Kind != "example-translation"), "translation toggles determine actual speech segments");
    }
    Check((await http.GetFromJsonAsync<List<AudioTimelineEntry>>($"/audio-sessions/{id}/timeline", new JsonSerializerOptions(JsonSerializerDefaults.Web)))!.SequenceEqual(timeline), "later example counts cannot change historical timeline content");
    Check(await db.WordExamples.CountAsync(e => e.WordId == bike.Id && e.Translation != null) == 7, "validated examples and Russian translations persist in PostgreSQL");
    var before = paidCalls; rejectSpeech = true;
    var failureId = await Create([bike.Id], 5, false, false, Guid.NewGuid()); var failed = await Wait(failureId);
    Check(failed.GetProperty("status").GetString() == "failed" && failed.GetProperty("audioUrl").ValueKind == JsonValueKind.Null, "provider failure is a real terminal state with no playable URL");
    await processor.ProcessAsync(failureId, default);
    Check(paidCalls == before + 1, "failed paid synthesis is not automatically retried");
    rejectSpeech = false;
    var interrupted = new AudioSession { RequestId = Guid.NewGuid(), Status = "processing", SynthesisClaimsJson = "[0]", Words = [new AudioSessionWord { WordId = bike.Id, Position = 0 }] };
    db.Add(interrupted); await db.SaveChangesAsync(); before = paidCalls;
    await processor.ProcessAsync(interrupted.Id, default); db.ChangeTracker.Clear();
    Check((await db.AudioSessions.FindAsync(interrupted.Id))!.Status == "failed" && paidCalls == before, "an ambiguous crash claim prevents another paid request");
    var corruptWord = new Word { Text = "garden" }; db.Add(corruptWord); await db.SaveChangesAsync();
    malformed = true; before = paidCalls;
    var invalidId = await Create([corruptWord.Id], 5, true, true, Guid.NewGuid());
    Check((await Wait(invalidId)).GetProperty("status").GetString() == "failed" && paidCalls == before, "invalid structured examples fail before synthesis");
    malformed = false;
    var resume = new AudioSession { RequestId = Guid.NewGuid(), Status = "processing", IncludeWordTranslation = false, SynthesisClaimsJson = "[0]", Words = [new AudioSessionWord { WordId = bike.Id, Position = 0 }] };
    db.Add(resume); await db.SaveChangesAsync();
    var parts = Path.Combine(root, "sessions", $"session-{resume.Id}", "parts"); Directory.CreateDirectory(parts); File.Copy(sample, Path.Combine(parts, "0.mp3"));
    before = paidCalls; await processor.ProcessAsync(resume.Id, default);
    Check((await Get(resume.Id)).GetProperty("status").GetString() == "ready" && paidCalls == before + 5, "completed segment checkpoints resume without resynthesizing saved audio");
    var concurrentKey = Guid.NewGuid();
    var duplicateIds = await Task.WhenAll(Create([bike.Id], 5, false, false, concurrentKey), Create([bike.Id], 5, false, false, concurrentKey));
    Check(duplicateIds[0] == duplicateIds[1], "concurrent duplicate POSTs create a single database session");
    Check((await Wait(duplicateIds[0])).GetProperty("status").GetString() == "ready", "concurrent request remains playable");
    before = paidCalls;
    await redis.GetDatabase().ExecuteAsync("ACL", "SETUSER", "default", "-xadd");
    try
    {
        var queueFailure = await Create([bike.Id], 5, true, false, Guid.NewGuid());
        Check((await Get(queueFailure)).GetProperty("status").GetString() == "failed" && paidCalls == before, "queue publication failure is explicit and sends no speech requests");
    }
    finally { await redis.GetDatabase().ExecuteAsync("ACL", "SETUSER", "default", "+xadd"); }
    using var invalid = await http.PostAsJsonAsync("/audio-sessions", new { wordIds = new[] { bike.Id, bike.Id }, examplesPerWord = 4 });
    Check(invalid.StatusCode == HttpStatusCode.BadRequest, "invalid selection/settings rejected before creating work");
    using var conflict = await http.PostAsJsonAsync("/audio-sessions", new { wordIds = new[] { bike.Id }, examplesPerWord = 5, requestId });
    Check(conflict.StatusCode == HttpStatusCode.Conflict, "idempotency key cannot be reused with different settings");
    await db.Words.Where(w => w.Id == glasses.Id).ExecuteUpdateAsync(u => u.SetProperty(w => w.DeletedAt, DateTimeOffset.UtcNow));
    Check((await Get(id)).GetProperty("words").GetArrayLength() == 2, "session metadata survives vocabulary soft deletion");
    File.Delete(Path.Combine(root, "sessions", $"session-{id}", "audio.mp3"));
    Check((await Get(id)).GetProperty("status").GetString() == "failed", "missing finished audio is never advertised as Ready");
    Console.WriteLine($"All checks passed; {exampleCalls} Ollama HTTP stubs, {paidCalls} ElevenLabs HTTP stubs; ZERO live provider requests.");
}
finally
{
    if (worker is not null) { await worker.StopAsync(default); worker.Dispose(); }
    if (api is { HasExited: false }) { api.Kill(entireProcessTree: true); await api.WaitForExitAsync(); }
    if (redis is not null) await redis.DisposeAsync();
    await Run("docker", "rm", "-f", container);
    NpgsqlConnection.ClearAllPools();
    await using var drop = new NpgsqlCommand($"DROP DATABASE \"{name}\" WITH (FORCE)", adminConnection); await drop.ExecuteNonQueryAsync();
    Directory.Delete(root, recursive: true);
    Console.WriteLine("Disposable database, Redis container and fixture files removed.");
}
sealed class Factory(DbContextOptions<VocaCycleDbContext> options) : IDbContextFactory<VocaCycleDbContext> { public VocaCycleDbContext CreateDbContext() => new(options); }
sealed class Handler(Func<HttpRequestMessage,CancellationToken,Task<HttpResponseMessage>> send) : HttpMessageHandler { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) => send(request, token); }
sealed class Clients(Func<string,HttpRequestMessage,CancellationToken,Task<HttpResponseMessage>> send) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) => new(new Handler((request, token) => send(name, request, token))) { BaseAddress = new("https://stub.invalid"), Timeout = TimeSpan.FromMinutes(3) };
}

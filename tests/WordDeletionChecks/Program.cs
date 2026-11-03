using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Infrastructure.Models;
using VocaCycle.Infrastructure.Services;
using VocaCycle.Worker.Services;

static void Check(bool value, string message) { if (!value) throw new Exception(message); Console.WriteLine("PASS " + message); }
var admin = Environment.GetEnvironmentVariable("WORD_DELETE_TEST_ADMIN");
if (string.IsNullOrWhiteSpace(admin)) throw new InvalidOperationException("Set WORD_DELETE_TEST_ADMIN to explicitly permit creating a disposable test database.");
var name = "vocacycle_delete_test_" + Guid.NewGuid().ToString("N");
var builder = new NpgsqlConnectionStringBuilder(admin) { Database = name };
await using var connection = new NpgsqlConnection(admin);
await connection.OpenAsync();
await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", connection)) await create.ExecuteNonQueryAsync();
var root = Path.Combine(Path.GetTempPath(), name); Directory.CreateDirectory(Path.Combine(root, "pronunciations"));
Process? api = null;
try
{
    var options = new DbContextOptionsBuilder<VocaCycleDbContext>().UseNpgsql(builder.ConnectionString).Options;
    var factory = new Factory(options);
    await using var db = factory.CreateDbContext();
    await db.Database.MigrateAsync();
    Check(!db.Database.HasPendingModelChanges(), "migration matches model");
    async Task<Word> Add(string text, bool audio = true) {
        var w = new Word { Text = text, Translation = "saved", Ipa = "/saved/" };
        db.Add(w); await db.SaveChangesAsync();
        if (audio) {
            w.PronunciationAudioUrl = $"/words/{w.Id}/pronunciation";
            File.WriteAllBytes(Path.Combine(root, "pronunciations", $"word-{w.Id}.mp3"), [73,68,51,1]);
            await db.SaveChangesAsync();
        }
        return w;
    }
    var archived = await Add("archive");
    db.WordExamples.Add(new WordExample { WordId = archived.Id, Text = "An archived example.", Position = 1 });
    var session = new AudioSession { Status = "ready", Words = [new AudioSessionWord { WordId = archived.Id, Position = 0 }] };
    db.Add(session); await db.SaveChangesAsync();
    var sessionFile = Path.Combine(root, $"session-{session.Id}-word-{archived.Id}.wav");
    File.WriteAllText(sessionFile, "unchanged session recording");
    await WordDeletion.DeleteAsync(db, archived.Id, root, default);
    Check(!await db.Words.AnyAsync(w => w.Id == archived.Id), "deleted word hidden from vocabulary");
    Check(await db.Words.IgnoreQueryFilters().AnyAsync(w => w.Id == archived.Id && w.DeletedAt != null), "historical word retained");
    Check(await db.WordExamples.AnyAsync(e => e.WordId == archived.Id), "session example history preserved");
    var historical = await db.AudioSessions.IgnoreQueryFilters().Include(s => s.Words).ThenInclude(w => w.Word).SingleAsync(s => s.Id == session.Id);
    Check(historical.Words.Single().Word.Text == "archive", "session word metadata preserved");
    Check(File.ReadAllText(sessionFile) == "unchanged session recording", "session audio unchanged");
    Check(!File.Exists(Path.Combine(root, "pronunciations", $"word-{archived.Id}.mp3")), "only standalone pronunciation removed");
    await WordDeletion.DeleteAsync(db, archived.Id, root, default);
    await WordDeletion.DeleteAsync(db, long.MaxValue, root, default);
    Check((await Add("archive", false)).Id != archived.Id, "same spelling can be saved again with a new ID");

    var blocked = await Add("blocked", false);
    Directory.CreateDirectory(Path.Combine(root, "pronunciations", $"word-{blocked.Id}.mp3"));
    try { await WordDeletion.DeleteAsync(db, blocked.Id, root, default); throw new Exception("Expected filesystem failure"); }
    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    db.ChangeTracker.Clear();
    Check(await db.Words.AnyAsync(w => w.Id == blocked.Id), "file cleanup failure rolls back deletion");

    var processing = await Add("processing", false);
    var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var dictionaryCalls = 0; var paidCalls = 0;
    var dictionary = new DictionaryIpaClient(new HttpClient(new Handler((_, _) => {
        dictionaryCalls++; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("[]") });
    })) { BaseAddress = new Uri("https://api.dictionaryapi.dev/") });
    var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
        ["VOCACYCLE_STORAGE"] = root, ["ElevenLabs:ApiKey"] = "fixture-only", ["ElevenLabs:VoiceId"] = "fixture",
        ["ElevenLabs:ModelId"] = "fixture", ["ElevenLabs:VoiceAccent"] = "en-US", ["ElevenLabs:TimeoutSeconds"] = "20", ["ElevenLabs:OutputFormat"] = "mp3_22050_32"
    }).Build();
    var clients = new Clients(async (_, _) => {
        paidCalls++; entered.TrySetResult(); await finish.Task;
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([73,68,51,1]) { Headers = { ContentType = new("audio/mpeg") } } };
    });
    var service = new PronunciationService(factory, dictionary, new(clients, config), config, NullLogger<PronunciationService>.Instance);
    var work = service.ProcessAsync(processing.Id, default);
    await entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
    await using (var deleting = factory.CreateDbContext()) await WordDeletion.DeleteAsync(deleting, processing.Id, root, default);
    finish.SetResult(); await work;
    Check(!File.Exists(Path.Combine(root, "pronunciations", $"word-{processing.Id}.mp3")), "in-flight pronunciation result discarded after deletion");
    await service.ProcessAsync(processing.Id, default);
    Check(dictionaryCalls == 1 && paidCalls == 1, "queued/redelivered deleted word skips all providers (HTTP stubs only)");
    Check(await db.Words.Where(w => w.Id == processing.Id).ExecuteUpdateAsync(u => u.SetProperty(w => w.Translation, "late")) == 0,
        "late translation updates cannot mutate deleted words");

    // Exercise the real HTTP endpoints with only the disposable database. No POST
    // or real worker is started, and the Redis endpoint is deliberately unusable.
    var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
    var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
    var repo = Directory.GetCurrentDirectory();
    while (!File.Exists(Path.Combine(repo, "VocaCycle.slnx"))) repo = Directory.GetParent(repo)!.FullName;
    var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
    start.ArgumentList.Add(Path.Combine(repo, "apps/api/bin/Debug/net10.0/VocaCycle.Api.dll"));
    start.ArgumentList.Add("--urls"); start.ArgumentList.Add($"http://127.0.0.1:{port}");
    start.Environment["ConnectionStrings__DefaultConnection"] = builder.ConnectionString;
    start.Environment["ConnectionStrings__Redis"] = "127.0.0.1:1";
    start.Environment["VOCACYCLE_STORAGE"] = root;
    api = Process.Start(start)!; api.BeginOutputReadLine(); api.BeginErrorReadLine();
    using var http = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}"), Timeout = TimeSpan.FromSeconds(10) };
    var healthy = false;
    for (var i = 0; i < 50; i++) {
        try { healthy = (await http.GetAsync("/health")).IsSuccessStatusCode; if (healthy) break; } catch (HttpRequestException) { }
        await Task.Delay(100);
    }
    Check(healthy, "isolated API started");
    var httpWord = await Add("httpword");
    Check((await http.DeleteAsync($"/words/{httpWord.Id}")).StatusCode == HttpStatusCode.NoContent, "DELETE endpoint returns 204");
    Check((await http.DeleteAsync($"/words/{httpWord.Id}")).StatusCode == HttpStatusCode.NoContent, "repeated DELETE remains 204");
    Check((await http.DeleteAsync("/words/0")).StatusCode == HttpStatusCode.BadRequest, "invalid ID rejected");
    Check((await http.DeleteAsync($"/words/{blocked.Id}")).StatusCode == HttpStatusCode.ServiceUnavailable, "cleanup failure returns 503");
    var list = JsonDocument.Parse(await http.GetStringAsync("/words"));
    Check(!list.RootElement.EnumerateArray().Any(w => w.GetProperty("id").GetInt64() == httpWord.Id), "GET words excludes deleted word");
    Check((await http.GetAsync($"/words/{httpWord.Id}/pronunciation")).StatusCode == HttpStatusCode.NotFound, "deleted pronunciation endpoint is inaccessible");
    var sessionJson = JsonDocument.Parse(await http.GetStringAsync($"/audio-sessions/{session.Id}"));
    Check(sessionJson.RootElement.GetProperty("words")[0].GetProperty("text").GetString() == "archive", "HTTP session retains archived word metadata");
}
finally
{
    if (api is { HasExited: false }) { api.Kill(entireProcessTree: true); await api.WaitForExitAsync(); }
    NpgsqlConnection.ClearAllPools();
    await using var drop = new NpgsqlCommand($"DROP DATABASE \"{name}\" WITH (FORCE)", connection); await drop.ExecuteNonQueryAsync();
    if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    Console.WriteLine("Disposable database and fixture files removed.");
}
sealed class Factory(DbContextOptions<VocaCycleDbContext> options) : IDbContextFactory<VocaCycleDbContext>
{ public VocaCycleDbContext CreateDbContext() => new(options); }
sealed class Handler(Func<HttpRequestMessage,CancellationToken,Task<HttpResponseMessage>> send) : HttpMessageHandler
{ protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token) => send(request,token); }
sealed class Clients(Func<HttpRequestMessage,CancellationToken,Task<HttpResponseMessage>> send) : IHttpClientFactory
{ public HttpClient CreateClient(string name) => new(new Handler(send)); }

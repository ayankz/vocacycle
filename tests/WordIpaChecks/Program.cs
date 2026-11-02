using System.Net;
using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using StackExchange.Redis;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Infrastructure.Models;
using VocaCycle.Worker;
using VocaCycle.Worker.Services;

static void Check(bool condition, string label) { if (!condition) throw new Exception(label); Console.WriteLine($"PASS {label}"); }
static DictionaryIpaClient Client(string json, HttpStatusCode status = HttpStatusCode.OK) =>
    new(new HttpClient(new Handler((_, _) => Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(json) }))) { BaseAddress = new Uri("https://api.dictionaryapi.dev/") });
static async Task Throws(Func<Task> action, string label) { try { await action(); } catch { Console.WriteLine($"PASS {label}"); return; } throw new Exception(label); }

Check(await Client("""[{"phonetic":"/fallback/","phonetics":[{"text":""},{"text":"/ˈæp.əl/"},{"text":"/other/"}]}]""").LookupAsync("apple", default) == "/ˈæp.əl/", "phonetics preferred and stable");
Check(await Client("""[{"phonetic":"həˈləʊ","phonetics":[{"text":42}]}]""").LookupAsync("hello", default) == "həˈləʊ", "entry fallback preserves unwrapped IPA");
Check(await Client("[]", HttpStatusCode.NotFound).LookupAsync("unknown", default) is null, "404 is absence");
Check(await Client("""[{"phonetics":[{"text":"https://bad"},{"text":"<bad>"},{"text":"/broken]"}]}]""").LookupAsync("unknown", default) is null, "malformed candidates rejected");
Check(await Client("""[{"phonetics":[{"text":"/ˈkjɔː-/"},{"text":"/ˈkjɝ.i.əs/"}]}]""").LookupAsync("curious", default) == "/ˈkjɝ.i.əs/", "truncated candidate skipped");
Check(await Client("[{}]").LookupAsync("unknown", default) is null, "missing fields are absence");
foreach (var status in new[] { HttpStatusCode.TooManyRequests, HttpStatusCode.InternalServerError, HttpStatusCode.ServiceUnavailable })
    await Throws(async () => await Client("{}", status).LookupAsync("apple", default), $"{status} retryable");
await Throws(async () => await Client("not json").LookupAsync("apple", default), "malformed JSON retryable");
await Throws(async () => await Client("{}").LookupAsync("apple", default), "invalid root retryable");
foreach (var exception in new Exception[] { new HttpRequestException(), new TaskCanceledException() })
{
    var failing = new DictionaryIpaClient(new HttpClient(new Handler((_, _) => Task.FromException<HttpResponseMessage>(exception))) { BaseAddress = new Uri("https://api.dictionaryapi.dev/") });
    await Throws(async () => await failing.LookupAsync("apple", default), exception.GetType().Name);
}
var encoded = new DictionaryIpaClient(new HttpClient(new Handler((request, _) => {
    Check(request.RequestUri!.AbsoluteUri.EndsWith("ice%2Fcream%3F"), "URL encoding");
    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
})) { BaseAddress = new Uri("https://api.dictionaryapi.dev/") });
await encoded.LookupAsync("ice/cream?", default);

if (args.Contains("--live"))
{
    var live = new DictionaryIpaClient(new HttpClient { BaseAddress = new Uri("https://api.dictionaryapi.dev/"), Timeout = TimeSpan.FromSeconds(5) });
    foreach (var text in new[] { "apple", "curious" })
        Check(DictionaryIpaClient.IsValid(await live.LookupAsync(text, default)), $"live {text}");
    Console.WriteLine($"LIVE resilient IPA: {await live.LookupAsync("resilient", default) ?? "null (no dictionary phonetic text)"}");
    Check(await live.LookupAsync("zzzzvocacycleunknownwordzzzz", default) is null, "live unknown word");
}

// Integration mode requires a dedicated disposable PostgreSQL database and Redis server.
if (Environment.GetEnvironmentVariable("IPA_TEST_DB") is { } connectionString)
{
    var options = new DbContextOptionsBuilder<VocaCycleDbContext>().UseNpgsql(connectionString).Options;
    var factory = new Factory(options);
    await using var db = factory.CreateDbContext();
    await db.Database.MigrateAsync("20261030120000_MakeWordTranslationOptional");
    await db.Database.ExecuteSqlRawAsync("""INSERT INTO "Words" ("Text", "Translation") VALUES ('old', 'старый')""");
    await db.Database.MigrateAsync();
    var old = await db.Words.SingleAsync(w => w.Text == "old"); Check(old.Ipa is null && old.Translation == "старый", "migration preserves existing rows");
    using var redis = await ConnectionMultiplexer.ConnectAsync(Environment.GetEnvironmentVariable("IPA_TEST_REDIS") ?? "localhost:55440");
    var store = redis.GetDatabase(); const string stream = "vocacycle:translation:jobs"; const string group = "translation-workers"; const string consumer = "ipa-check";
    await store.StreamCreateConsumerGroupAsync(stream, group, "0-0", true);
    var translator = new Translator(); var requests = 0; var failIpa = true;
    var dictionary = new DictionaryIpaClient(new HttpClient(new Handler((_, _) => {
        requests++;
        return Task.FromResult(new HttpResponseMessage(failIpa ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.OK) { Content = new StringContent("""[{"phonetics":[{"text":"/ˈæp.əl/"}]}]""") });
    })) { BaseAddress = new Uri("https://api.dictionaryapi.dev/") });
    var worker = new TranslationWorker(redis, factory, translator, dictionary, NullLogger<TranslationWorker>.Instance);
    typeof(TranslationWorker).GetField("_consumer", BindingFlags.NonPublic | BindingFlags.Instance)!.SetValue(worker, consumer);
    async Task Process(StreamEntry message) => await (Task)typeof(TranslationWorker).GetMethod("ProcessMessageAsync", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(worker, [store, message, CancellationToken.None])!;
    async Task<StreamEntry> Enqueue(long id) { await store.StreamAddAsync(stream, "wordId", id.ToString()); return (await store.StreamReadGroupAsync(stream, group, consumer, ">", 1)).Single(); }
    var apple = new Word { Text = "apple" }; db.Add(apple); await db.SaveChangesAsync();
    var job = await Enqueue(apple.Id); await Process(job); await db.Entry(apple).ReloadAsync();
    Check(apple.Translation == "яблоко" && apple.Ipa is null && (await store.StreamPendingAsync(stream, group)).PendingMessageCount == 1, "translation succeeds IPA failure remains pending");
    failIpa = false; await Process(job); await db.Entry(apple).ReloadAsync();
    Check(apple.Ipa == "/ˈæp.əl/" && translator.Calls == 1 && (await store.StreamPendingAsync(stream, group)).PendingMessageCount == 0, "IPA retry preserves translation and acknowledges");
    var calls = requests; await Process(await Enqueue(apple.Id)); Check(requests == calls && translator.Calls == 1, "completed word skips providers");
    translator.Fail = true; var curious = new Word { Text = "curious" }; db.Add(curious); await db.SaveChangesAsync();
    job = await Enqueue(curious.Id); await Process(job); await db.Entry(curious).ReloadAsync();
    Check(curious.Ipa is not null && curious.Translation is null, "IPA saved despite translation failure");
    translator.Fail = false; await Process(job); await db.Entry(curious).ReloadAsync();
    Check(curious.Ipa is not null && curious.Translation is not null && requests == calls + 1, "translation retry skips persisted IPA");
    await using var other = factory.CreateDbContext();
    await Task.WhenAll(db.Words.Where(w => w.Id == apple.Id).ExecuteUpdateAsync(u => u.SetProperty(w => w.Ipa, "/test/")), other.Words.Where(w => w.Id == apple.Id).ExecuteUpdateAsync(u => u.SetProperty(w => w.Translation, "тест")));
    await db.Entry(apple).ReloadAsync(); Check(apple.Ipa == "/test/" && apple.Translation == "тест", "concurrent field updates preserved");
    await Process(await Enqueue(long.MaxValue)); Check((await store.StreamPendingAsync(stream, group)).PendingMessageCount == 0, "missing word acknowledged");
    translator.Fail = true; failIpa = true;
    var exhausted = new Word { Text = "exhausted" }; db.Add(exhausted); await db.SaveChangesAsync();
    job = await Enqueue(exhausted.Id); await Process(job);
    for (var delivery = 2; delivery <= 3; delivery++)
    {
        job = (await store.StreamReadGroupAsync(stream, group, consumer, "0-0", 1)).Single();
        await Process(job);
    }
    Check((await store.StreamPendingAsync(stream, group)).PendingMessageCount == 0, "failures acknowledge after three Redis deliveries");
    Check(!await db.WordExamples.AnyAsync(), "Add enrichment generates no examples");
}

sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
{ protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request, cancellationToken); }
sealed class Factory(DbContextOptions<VocaCycleDbContext> options) : IDbContextFactory<VocaCycleDbContext>
{ public VocaCycleDbContext CreateDbContext() => new(options); }
sealed class Translator : IWordTranslator
{
    public int Calls; public bool Fail;
    public Task<string> TranslateAsync(string word, CancellationToken cancellationToken) { Calls++; return Fail ? Task.FromException<string>(new HttpRequestException()) : Task.FromResult("яблоко"); }
}

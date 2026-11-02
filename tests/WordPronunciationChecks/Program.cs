using System.Net;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using StackExchange.Redis;
using VocaCycle.Infrastructure.Data;
using VocaCycle.Infrastructure.Models;
using VocaCycle.Worker;
using VocaCycle.Worker.Services;

static void Check(bool condition, string label) { if (!condition) throw new Exception(label); Console.WriteLine($"PASS {label}"); }
static async Task Throws(Func<Task> action, string label)
{
    try { await action(); } catch { Console.WriteLine($"PASS {label}"); return; }
    throw new Exception(label);
}
const string us = "https://api.dictionaryapi.dev/media/pronunciations/en/apple-us.mp3";
const string cc0 = "https://creativecommons.org/publicdomain/zero/1.0/";
static string Fixture(string? audio, string? license, string? ipa = "/ˈæp.əl/", string source = "https://commons.wikimedia.org/w/index.php?curid=718877") =>
    JsonSerializer.Serialize(new[] { new { phonetics = new[] { new { text = ipa, audio, sourceUrl = source, license = new { url = license } } } } });
static DictionaryIpaClient Dictionary(string json, HttpStatusCode status = HttpStatusCode.OK) =>
    new(new HttpClient(new Handler((_, _) => Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(json) }))) { BaseAddress = new Uri("https://api.dictionaryapi.dev/") });
static HttpResponseMessage Mp3() => new(HttpStatusCode.OK) { Content = new ByteArrayContent([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]) { Headers = { ContentType = new("audio/mpeg") } } };
static IConfiguration Config(string? root = null) => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
    ["VOCACYCLE_STORAGE"] = root, ["ElevenLabs:ApiKey"] = "test-not-a-real-key", ["ElevenLabs:VoiceId"] = "test-voice",
    ["ElevenLabs:ModelId"] = "test-model", ["ElevenLabs:VoiceAccent"] = "en-US", ["ElevenLabs:TimeoutSeconds"] = "2",
    ["ElevenLabs:OutputFormat"] = "mp3_44100_128"
}).Build();
var suitable = await Dictionary(Fixture(us, cc0)).LookupPronunciationAsync("apple", default);
Check(suitable.AudioUrl == us && suitable.Ipa is not null, "CC0 US recording and IPA from one response");
Check((await Dictionary(Fixture(us, cc0, null)).LookupPronunciationAsync("apple", default)).AudioUrl == us, "audio without IPA accepted");
foreach (var url in new[] { us.Replace("-us", "-uk"), us.Replace("https:", "http:"), "file:///apple-us.mp3", "https://localhost/apple-us.mp3", us + "?redirect=evil", us.Replace("api.dictionaryapi.dev", "api.dictionaryapi.dev.evil"), us.Replace("api.dictionaryapi.dev", "user@api.dictionaryapi.dev"), us.Replace(".dev/", ".dev:444/"), "", "//api.dictionaryapi.dev/media/pronunciations/en/apple-us.mp3" })
    Check((await Dictionary(Fixture(url, cc0)).LookupPronunciationAsync("apple", default)).AudioUrl is null, $"unsafe/non-US URL rejected: {url}");
foreach (var license in new[] { "https://creativecommons.org/licenses/by-sa/3.0/", "https://creativecommons.org/licenses/by/4.0/", null, "" })
    Check((await Dictionary(Fixture(us, license)).LookupPronunciationAsync("apple", default)).AudioUrl is null, "unapproved recording license rejected");
Check((await Dictionary(Fixture(us, cc0, source: "https://evil.example/")).LookupPronunciationAsync("apple", default)).AudioUrl is null, "unknown provenance rejected");
foreach (var json in new[] { "[]", "[{}]", "[{\"phonetics\":[]}]" })
    Check((await Dictionary(json).LookupPronunciationAsync("apple", default)).AudioUrl is null, "successful dictionary absence");
Check((await Dictionary("{}", HttpStatusCode.NotFound).LookupPronunciationAsync("apple", default)).AudioUrl is null, "404 is confirmed absence");
foreach (var status in new[] { HttpStatusCode.TooManyRequests, HttpStatusCode.InternalServerError, HttpStatusCode.ServiceUnavailable })
    await Throws(async () => await Dictionary("{}", status).LookupPronunciationAsync("apple", default), $"dictionary {status} stays retryable");
foreach (var json in new[] { "not json", "{}", "[null]", "[{\"phonetics\":42}]" })
    await Throws(async () => await Dictionary(json).LookupPronunciationAsync("apple", default), "malformed dictionary does not confirm absence");
var multiple = "[{\"phonetics\":" + JsonSerializer.Serialize(new[] {
    new { audio = us.Replace("apple", "zebra"), sourceUrl = "https://commons.wikimedia.org/", license = new { url = cc0 } },
    new { audio = us, sourceUrl = "https://commons.wikimedia.org/", license = new { url = cc0 } }
}) + "}]";
Check((await Dictionary(multiple).LookupPronunciationAsync("apple", default)).AudioUrl == us, "multiple recordings sorted deterministically");

await Throws(async () => await Dictionary(new string('x', 1_048_577)).LookupPronunciationAsync("apple", default), "oversized dictionary response rejected");
var quota = new PronunciationAudioClient(new Clients((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized) {
    Content = new StringContent("""{"detail":{"status":"quota_exceeded","message":"sensitive"}}""") })), Config());
try { await quota.SynthesizeAsync("apple", default); throw new Exception("Expected quota failure"); }
catch (PronunciationSynthesisException ex) { Check(ex.Message == "quota", "quota distinguished from authentication failure"); }
var calls = 0;
var http = new Clients((request, _) => {
    calls++;
    Check(request.RequestUri!.Host == "api.elevenlabs.io" && request.RequestUri.Query.Contains("mp3_44100_128"), "configured output format");
    Check(request.Headers.GetValues("xi-api-key").Single() == "test-not-a-real-key", "server-side key header");
    using var body = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
    Check(body.RootElement.GetProperty("text").GetString() == "apple" && body.RootElement.GetProperty("model_id").GetString() == "test-model", "word-only synthesis with configured model");
    return Task.FromResult(Mp3());
});
var audio = new PronunciationAudioClient(http, Config());
Check(audio.IsConfigured(out _) && (await audio.SynthesizeAsync("apple", default)).Length > 0 && calls == 1, "one synthesis request");
var missing = new ConfigurationBuilder().Build();
Check(!new PronunciationAudioClient(http, missing).IsConfigured(out var diagnostic) && !diagnostic.Contains("test-not-a-real-key"), "safe missing configuration diagnostic");
var wrongAccent = Config(); wrongAccent["ElevenLabs:VoiceAccent"] = "en-GB";
Check(!new PronunciationAudioClient(http, wrongAccent).IsConfigured(out _), "American voice confirmation required");
foreach (var status in new[] { HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden, HttpStatusCode.PaymentRequired, HttpStatusCode.TooManyRequests, HttpStatusCode.InternalServerError })
{
    var attempts = 0;
    var failing = new PronunciationAudioClient(new Clients((_, _) => { attempts++; return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent("sensitive upstream body") }); }), Config());
    try { await failing.SynthesizeAsync("apple", default); throw new Exception("Expected failure"); }
    catch (PronunciationSynthesisException ex) { Check(attempts == 1 && !ex.Message.Contains("sensitive"), $"{status} classified without automatic paid retry"); }
}
foreach (var content in new[] { "", "invalid mp3", new string('a', 2_097_153) })
{
    var invalid = new PronunciationAudioClient(new Clients((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(content, Encoding.UTF8, "audio/mpeg") })), Config());
    await Throws(async () => await invalid.SynthesizeAsync("apple", default), "invalid/empty/oversized audio rejected");
}
var invalidType = new PronunciationAudioClient(new Clients((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("ID3bytes") })), Config());
await Throws(async () => await invalidType.DownloadDictionaryAsync(us, default), "wrong audio content-type rejected");
await Throws(async () => await audio.DownloadDictionaryAsync("https://localhost/private.mp3", default), "download URL revalidated before HTTP");
var redirect = new PronunciationAudioClient(new Clients((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Redirect))), Config());
await Throws(async () => await redirect.DownloadDictionaryAsync(us, default), "redirect response rejected");
var cancelled = new CancellationToken(true);
await Throws(async () => await audio.SynthesizeAsync("apple", cancelled), "cancellation propagated");

// Explicit opt-in: only point at fresh disposable instances, never development data.
if (Environment.GetEnvironmentVariable("PRONUNCIATION_TEST_DB") is { } connectionString)
{
    var root = Path.Combine(Path.GetTempPath(), "vocacycle-pronunciation-check-" + Guid.NewGuid().ToString("N"));
    var config = Config(root);
    var options = new DbContextOptionsBuilder<VocaCycleDbContext>().UseNpgsql(connectionString).Options;
    var factory = new Factory(options);
    await using var db = factory.CreateDbContext();
    await db.Database.MigrateAsync("20261102052556_AddWordIpa");
    await db.Database.ExecuteSqlRawAsync("""INSERT INTO "Words" ("Text", "Translation", "Ipa") VALUES ('old', 'старый', '/old/')""");
    await db.Database.MigrateAsync();
    var old = await db.Words.SingleAsync(w => w.Text == "old");
    Check(old.PronunciationAudioUrl is null && old.Translation == "старый" && old.Ipa == "/old/", "migration preserves existing fields");
    var requests = 0; var paid = 0; var downloads = 0; var dictionaryFail = false; var paidFail = false; var downloadFail = false; var eligible = false;
    var dictionary = new DictionaryIpaClient(new HttpClient(new Handler((_, _) => {
        requests++;
        return Task.FromResult(new HttpResponseMessage(dictionaryFail ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.OK) { Content = new StringContent(Fixture(eligible ? us : null, cc0)) });
    })) { BaseAddress = new Uri("https://api.dictionaryapi.dev/") });
    var providers = new Clients((request, _) => {
        if (request.RequestUri!.Host == "api.elevenlabs.io") { paid++; if (paidFail) throw new HttpRequestException("ambiguous failure"); }
        else { downloads++; if (downloadFail) throw new HttpRequestException(); }
        return Task.FromResult(Mp3());
    });
    var service = new PronunciationService(factory, dictionary, new(providers, config), config, NullLogger<PronunciationService>.Instance);
    async Task<Word> Add(string text) { var w = new Word { Text = text }; db.Add(w); await db.SaveChangesAsync(); return w; }
    var apple = await Add("apple");
    await service.ProcessAsync(apple.Id, default); await db.Entry(apple).ReloadAsync();
    Check(apple.Ipa is not null && apple.PronunciationAudioUrl == $"/words/{apple.Id}/pronunciation" && paid == 1 && requests == 1, "IPA and generated audio persisted from one dictionary lookup");
    Check(File.Exists(Path.Combine(root, "pronunciations", $"word-{apple.Id}.mp3")), "audio bytes stored in shared filesystem");
    await service.ProcessAsync(apple.Id, default);
    Check(paid == 1 && requests == 1, "existing pronunciation reused without provider calls");
    var serialized = JsonSerializer.Serialize(apple);
    Check(!serialized.Contains("DictionaryPronunciation") && !serialized.Contains("SynthesisAttempted"), "internal checkpoints excluded from API JSON");
    dictionaryFail = true; var transient = await Add("curious");
    await Throws(async () => await service.ProcessAsync(transient.Id, default), "transient dictionary failure remains retryable");
    Check(paid == 1, "transient dictionary failure never triggers paid fallback"); dictionaryFail = false;
    paidFail = true;
    await Throws(async () => await service.ProcessAsync(transient.Id, default), "ambiguous paid request fails safely");
    await db.Entry(transient).ReloadAsync();
    Check(transient.Ipa is not null && transient.PronunciationAudioUrl is null && transient.PronunciationSynthesisAttempted, "IPA survives audio failure with durable paid claim");
    var requestsBeforeRetry = requests; var paidBeforeRetry = paid;
    paidFail = false; await service.ProcessAsync(transient.Id, default);
    Check(paid == paidBeforeRetry && requests == requestsBeforeRetry, "redelivery suppresses ambiguous paid retry and duplicate dictionary lookup");
    eligible = true; downloadFail = true; var recorded = await Add("recorded");
    await Throws(async () => await service.ProcessAsync(recorded.Id, default), "dictionary audio download failure remains retryable");
    Check(paid == paidBeforeRetry, "failed dictionary download never invokes ElevenLabs");
    downloadFail = false; var requestsBeforeDownload = requests;
    await service.ProcessAsync(recorded.Id, default); await db.Entry(recorded).ReloadAsync();
    Check(recorded.PronunciationAudioUrl is not null && requests == requestsBeforeDownload && downloads == 2, "download retry reuses dictionary metadata");
    eligible = false; var concurrent = await Add("resilient");
    await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => service.ProcessAsync(concurrent.Id, default)));
    Check(paid == paidBeforeRetry + 1, "concurrent deliveries make only one paid call");
    var preserved = await Add("preserved");
    await db.Words.Where(w => w.Id == preserved.Id).ExecuteUpdateAsync(u => u.SetProperty(w => w.Ipa, "/saved/").SetProperty(w => w.Translation, "сохранено"));
    {
        var noTts = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["VOCACYCLE_STORAGE"] = root }).Build();
        var preserving = new PronunciationService(factory, dictionary, new(providers, noTts), noTts, NullLogger<PronunciationService>.Instance);
        await preserving.ProcessAsync(preserved.Id, default); await db.Entry(preserved).ReloadAsync();
        Check(preserved.Ipa == "/saved/" && preserved.Translation == "сохранено", "dictionary checkpoint preserves preexisting IPA and translation");
    }
    var phrase = await Add("two words"); await service.ProcessAsync(phrase.Id, default);
    Check(paid == paidBeforeRetry + 1, "phrases never sent to word-only synthesis");
    var emptyConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["VOCACYCLE_STORAGE"] = root }).Build();
    var unconfigured = new PronunciationService(factory, dictionary, new(providers, emptyConfig), emptyConfig, NullLogger<PronunciationService>.Instance);
    var unknown = await Add("unknown"); await unconfigured.ProcessAsync(unknown.Id, default); await db.Entry(unknown).ReloadAsync();
    Check(unknown.Ipa is not null && !unknown.PronunciationSynthesisAttempted && unknown.PronunciationAudioUrl is null, "missing TTS configuration preserves IPA and does not claim paid request");
    // Recover local bytes without another paid attempt after a DB update failure/crash.
    await db.Words.Where(w => w.Id == apple.Id).ExecuteUpdateAsync(u => u.SetProperty(w => w.PronunciationAudioUrl, (string?)null));
    await service.ProcessAsync(apple.Id, default); await db.Entry(apple).ReloadAsync();
    Check(apple.PronunciationAudioUrl is not null && paid == paidBeforeRetry + 1, "atomic file recovered without regeneration");
    await service.ProcessAsync(long.MaxValue, default);
    Check(!await db.WordExamples.AnyAsync(), "word enrichment creates no examples");

    if (Environment.GetEnvironmentVariable("PRONUNCIATION_TEST_REDIS") is { } redisConnection)
    {
        using var redis = await ConnectionMultiplexer.ConnectAsync(redisConnection);
        var store = redis.GetDatabase(); const string stream = "vocacycle:translation:jobs";
        const string translationGroup = "translation-workers", pronunciationGroup = "pronunciation-workers", consumer = "pronunciation-test";
        await store.StreamCreateConsumerGroupAsync(stream, translationGroup, "0-0", true);
        await store.StreamCreateConsumerGroupAsync(stream, pronunciationGroup, "0-0", true);
        var translator = new Translator();
        var translationWorker = new TranslationWorker(redis, factory, translator, NullLogger<TranslationWorker>.Instance);
        var pronunciationWorker = new PronunciationWorker(redis, service, NullLogger<PronunciationWorker>.Instance);
        foreach (var worker in new object[] { translationWorker, pronunciationWorker })
            worker.GetType().GetField("_consumer", BindingFlags.NonPublic | BindingFlags.Instance)!.SetValue(worker, consumer);
        async Task Process(object worker, StreamEntry message) => await (Task)worker.GetType().GetMethod("ProcessMessageAsync", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(worker, [store, message, CancellationToken.None])!;
        async Task<StreamEntry> Read(string group, string position = ">") => (await store.StreamReadGroupAsync(stream, group, consumer, position, 1)).Single();
        var legacy = await Add("legacy");
        await store.StreamAddAsync(stream, "wordId", legacy.Id.ToString());
        var paidBeforeLegacy = paid;
        await Process(pronunciationWorker, await Read(pronunciationGroup));
        await Process(translationWorker, await Read(translationGroup));
        Check(paid == paidBeforeLegacy && (await store.StreamPendingAsync(stream, pronunciationGroup)).PendingMessageCount == 0, "historical events never backfill paid audio");
        translator.Calls = 0;
        var retryWord = await Add("retry"); await store.StreamAddAsync(stream, new NameValueEntry[] { new("wordId", retryWord.Id.ToString()), new("pronunciation", "1") });
        dictionaryFail = true;
        await Process(translationWorker, await Read(translationGroup));
        var job = await Read(pronunciationGroup); await Process(pronunciationWorker, job);
        await db.Entry(retryWord).ReloadAsync();
        Check(retryWord.Translation is not null && retryWord.Ipa is null && (await store.StreamPendingAsync(stream, pronunciationGroup)).PendingMessageCount == 1, "translation success independent of dictionary failure");
        for (var i = 2; i <= 3; i++) { job = await Read(pronunciationGroup, "0-0"); await Process(pronunciationWorker, job); }
        Check((await store.StreamPendingAsync(stream, pronunciationGroup)).PendingMessageCount == 0 && translator.Calls == 1, "three pronunciation deliveries exhausted without repeating translation");
        dictionaryFail = false; translator.Fail = true;
        var partial = await Add("partial"); await store.StreamAddAsync(stream, new NameValueEntry[] { new("wordId", partial.Id.ToString()), new("pronunciation", "1") });
        job = await Read(translationGroup); await Process(translationWorker, job);
        await Process(pronunciationWorker, await Read(pronunciationGroup)); await db.Entry(partial).ReloadAsync();
        Check(partial.Translation is null && partial.Ipa is not null && partial.PronunciationAudioUrl is not null, "translation failure does not block IPA or audio");
        translator.Fail = false; await Process(translationWorker, await Read(translationGroup, "0-0"));
        await db.Entry(partial).ReloadAsync(); Check(partial.Translation is not null && partial.PronunciationAudioUrl is not null, "translation retry preserves pronunciation");
    }
    Console.WriteLine($"Integration audio fixture directory: {root}");
}
else Console.WriteLine("SKIP persistence/worker checks: PRONUNCIATION_TEST_DB not set.");

sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
{ protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) { token.ThrowIfCancellationRequested(); return send(request, token); } }
sealed class Clients(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : IHttpClientFactory
{ public HttpClient CreateClient(string name) => new(new Handler(send)); }
sealed class Factory(DbContextOptions<VocaCycleDbContext> options) : IDbContextFactory<VocaCycleDbContext>
{ public VocaCycleDbContext CreateDbContext() => new(options); }
sealed class Translator : IWordTranslator
{
    public int Calls; public bool Fail;
    public Task<string> TranslateAsync(string word, CancellationToken token) { Calls++; return Fail ? Task.FromException<string>(new HttpRequestException()) : Task.FromResult("перевод"); }
}

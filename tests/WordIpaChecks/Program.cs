using System.Net;
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

// Persistence, retry, and partial-success checks now live in WordPronunciationChecks,
// where dictionary/IPA and translation run in independent consumer groups.

sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
{ protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request, cancellationToken); }

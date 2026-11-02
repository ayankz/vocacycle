using System.Text.Json;
using System.Text.RegularExpressions;

namespace VocaCycle.Worker.Services;

// A completed lookup with null AudioUrl confirms no recording eligible under our policy.
public sealed record DictionaryPronunciation(string? Ipa, string? AudioUrl, string? SourceUrl, string? LicenseUrl)
{
    public static bool IsAllowedAudioUrl(string? value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.Scheme == "https" && uri.Host == "api.dictionaryapi.dev" && uri.IsDefaultPort
        && uri.UserInfo == "" && uri.Query == "" && uri.Fragment == ""
        && Regex.IsMatch(uri.AbsolutePath, @"^/media/pronunciations/en/[a-zA-Z0-9_-]+-us\.mp3$");

    public static DictionaryPronunciation? FromPhonetic(JsonElement value)
    {
        static string? Text(JsonElement obj, string name) =>
            obj.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.String ? field.GetString() : null;
        var audio = Text(value, "audio");
        var source = Text(value, "sourceUrl");
        if (!IsAllowedAudioUrl(audio)
            || !Uri.TryCreate(source, UriKind.Absolute, out var sourceUri)
            || sourceUri.Scheme != "https" || sourceUri.Host != "commons.wikimedia.org"
            || !sourceUri.IsDefaultPort || sourceUri.UserInfo != ""
            || !value.TryGetProperty("license", out var license) || license.ValueKind != JsonValueKind.Object)
            return null;
        var licenseUrl = Text(license, "url");
        // No creator attribution is supplied by this API. Only explicit CC0 is accepted.
        if (licenseUrl?.TrimEnd('/') != "https://creativecommons.org/publicdomain/zero/1.0") return null;
        return new(null, audio, source, licenseUrl);
    }
}

namespace VocaCycle.Api.Contracts;

public record CreateAudioSessionRequest(
    List<long> WordIds,
    bool IncludeWordTranslation = true,
    bool IncludeExampleTranslations = false
);
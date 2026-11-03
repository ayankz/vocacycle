namespace VocaCycle.Api.Contracts;

// Example/translation settings remain accepted for older clients; new sessions always use Pairs.
public record CreateAudioSessionRequest(
    List<long> WordIds,
    bool IncludeWordTranslation = true,
    bool IncludeExampleTranslations = false,
    int ExamplesPerWord = 5,
    Guid? RequestId = null
);
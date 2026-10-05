$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$available = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
$language = '__LANGUAGE__'
if ($language -ne 'auto') {
    $available = @($available | Where-Object { $_.Culture.TwoLetterISOLanguageName -eq $language })
}
$engines = @($available | Where-Object {
    $_.Culture.TwoLetterISOLanguageName -in @('ru', 'en') -or
    $_.Culture.Name -eq [Globalization.CultureInfo]::CurrentUICulture.Name
} | Sort-Object -Property @{ Expression = { $_.Culture.Name -ne [Globalization.CultureInfo]::CurrentUICulture.Name } } |
    Group-Object -Property { $_.Culture.TwoLetterISOLanguageName } | ForEach-Object { $_.Group[0] })
if ($engines.Count -eq 0) { exit 2 }
$candidates = New-Object System.Collections.Generic.List[object]
foreach ($recognizer in $engines) {
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($recognizer)
    try {
        $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
        $engine.SetInputToWaveFile('__AUDIO_PATH__')
        while ($result = $engine.Recognize([TimeSpan]::FromSeconds(10))) {
            $candidates.Add(@{
                text = $result.Text
                confidence = [double]$result.Confidence
                start = $result.Audio.AudioPosition.TotalSeconds
                end = ($result.Audio.AudioPosition + $result.Audio.Duration).TotalSeconds
            })
        }
    } catch {
        # Another installed recognizer may still handle this recording.
    } finally { $engine.Dispose() }
}
[Console]::Write((ConvertTo-Json -InputObject @($candidates.ToArray()) -Compress))

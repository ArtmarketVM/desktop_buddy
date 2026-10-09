#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#import <Speech/Speech.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

// Called from a Rust worker, never from the application event thread.
static char *json(id value) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    if (!data) return NULL;
    NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    return strdup(text.UTF8String);
}

static NSArray<NSString *> *localLanguages(void) {
    NSMutableArray *languages = [NSMutableArray array];
    for (NSString *name in @[@"en-US", @"ru-RU"]) {
        SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc]
            initWithLocale:[NSLocale localeWithLocaleIdentifier:name]];
        if (recognizer.supportsOnDeviceRecognition) [languages addObject:name];
    }
    return languages;
}

char *buddy_speech_languages(void) {
    @autoreleasepool {
        return json(localLanguages());
    }
}

static BOOL authorized(void) {
    SFSpeechRecognizerAuthorizationStatus status = SFSpeechRecognizer.authorizationStatus;
    if (status != SFSpeechRecognizerAuthorizationStatusNotDetermined)
        return status == SFSpeechRecognizerAuthorizationStatusAuthorized;
    // A raw development executable may have no purpose string. Avoid a TCC crash.
    if (![NSBundle.mainBundle objectForInfoDictionaryKey:@"NSSpeechRecognitionUsageDescription"])
        return NO;
    dispatch_semaphore_t ready = dispatch_semaphore_create(0);
    __block BOOL allowed = NO;
    dispatch_async(dispatch_get_main_queue(), ^{
        [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus result) {
            allowed = result == SFSpeechRecognizerAuthorizationStatusAuthorized;
            dispatch_semaphore_signal(ready);
        }];
    });
    if (dispatch_semaphore_wait(ready, dispatch_time(DISPATCH_TIME_NOW, 120 * NSEC_PER_SEC)))
        return NO;
    return allowed;
}

char *buddy_speech_transcribe(const uint8_t *audio, size_t length, const char *language) {
    @autoreleasepool {
        if (length <= 44 || !audio || !language)
            return json(@{@"error": @"The voice recording is invalid."});
        NSArray *languages = localLanguages();
        NSString *requested = [NSString stringWithUTF8String:language];
        NSMutableArray *selected = [NSMutableArray array];
        for (NSString *name in languages) {
            if ([requested isEqualToString:@"auto"] || [name hasPrefix:requested])
                [selected addObject:name];
        }
        if (!selected.count)
            return json(@{@"error": @"On-device recognition is unavailable for this language on this Mac. Enable or download the matching Dictation language in System Settings, or paste a transcript."});
        if (!authorized())
            return json(@{@"error": @"Allow Desktop Buddy in System Settings > Privacy & Security > Speech Recognition. For development, run the bundled app with its permission descriptions."});

        AVAudioFormat *format = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatFloat32
            sampleRate:16000 channels:1 interleaved:NO];
        AVAudioFrameCount frames = (AVAudioFrameCount)((length - 44) / 2);
        AVAudioPCMBuffer *buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:frames];
        if (!buffer || !buffer.floatChannelData)
            return json(@{@"error": @"Could not prepare the voice recording."});
        buffer.frameLength = frames;
        for (AVAudioFrameCount i = 0; i < frames; ++i) {
            int16_t sample = (int16_t)((uint16_t)audio[44 + i * 2] | ((uint16_t)audio[45 + i * 2] << 8));
            buffer.floatChannelData[0][i] = sample / 32768.0f;
        }

        NSMutableArray *candidates = [NSMutableArray array];
        for (NSString *name in selected) {
            SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc]
                initWithLocale:[NSLocale localeWithLocaleIdentifier:name]];
            // Never fall back to Apple's server-based recognizer.
            if (!recognizer.supportsOnDeviceRecognition) continue;
            NSOperationQueue *queue = [[NSOperationQueue alloc] init];
            queue.maxConcurrentOperationCount = 1;
            recognizer.queue = queue;
            SFSpeechAudioBufferRecognitionRequest *request = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
            request.requiresOnDeviceRecognition = YES;
            request.shouldReportPartialResults = NO;
            request.taskHint = SFSpeechRecognitionTaskHintDictation;
            [request appendAudioPCMBuffer:buffer];
            [request endAudio];
            NSCondition *condition = [[NSCondition alloc] init];
            __block BOOL done = NO;
            __block NSDictionary *candidate = nil;
            SFSpeechRecognitionTask *task = [recognizer recognitionTaskWithRequest:request
                resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
                    [condition lock];
                    if (!done && (result.isFinal || error)) {
                        if (result.isFinal && result.bestTranscription.segments.count) {
                            SFTranscription *transcript = result.bestTranscription;
                            double confidence = 0;
                            for (SFTranscriptionSegment *segment in transcript.segments)
                                confidence += segment.confidence;
                            SFTranscriptionSegment *first = transcript.segments.firstObject;
                            SFTranscriptionSegment *last = transcript.segments.lastObject;
                            candidate = @{@"text": transcript.formattedString,
                                @"confidence": @(confidence / transcript.segments.count),
                                @"start": @(first.timestamp), @"end": @(last.timestamp + last.duration)};
                        }
                        done = YES;
                        [condition signal];
                    }
                    [condition unlock];
                }];
            [condition lock];
            NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:45];
            while (!done && [condition waitUntilDate:deadline]) {}
            done = YES;
            if (candidate) [candidates addObject:candidate];
            [condition unlock];
            [task cancel];
        }
        if (!candidates.count)
            return json(@{@"error": @"Local recognition did not return clear speech. Check the Dictation language on this Mac, try again, or paste a transcript."});
        return json(@{@"candidates": candidates});
    }
}

void buddy_speech_free(char *value) {
    free(value);
}

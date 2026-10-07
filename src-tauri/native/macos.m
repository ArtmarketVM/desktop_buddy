#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Security/Security.h>
#import <Carbon/Carbon.h>
#import <Speech/Speech.h>
#import <CoreAudio/CoreAudio.h>
#include <sys/stat.h>

// Every exported string is owned by Rust after the call and freed with buddy_free.
static char *json(id value) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:NSJSONWritingFragmentsAllowed error:nil];
    return strdup(data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String : "null");
}
static char *failure(NSString *message) { return json(@{@"error": message}); }
void buddy_free(char *value) { free(value); }
static id attribute(AXUIElementRef element, CFStringRef name) {
    CFTypeRef value = NULL;
    if (!element || AXUIElementCopyAttributeValue(element, name, &value) != kAXErrorSuccess) return nil;
    return CFBridgingRelease(value);
}
static NSString *text(id value, NSUInteger limit) {
    if (![value isKindOfClass:NSString.class]) return @"";
    NSString *string = value;
    return [string substringToIndex:MIN(limit, string.length)];
}
static AXUIElementRef focusedWindow(pid_t pid) {
    AXUIElementRef application = AXUIElementCreateApplication(pid);
    AXUIElementSetMessagingTimeout(application, 0.08);
    CFTypeRef window = NULL;
    AXUIElementCopyAttributeValue(application, kAXFocusedWindowAttribute, &window);
    CFRelease(application);
    if (window && CFGetTypeID(window) != AXUIElementGetTypeID()) {
        CFRelease(window); return NULL;
    }
    if (window) AXUIElementSetMessagingTimeout((AXUIElementRef)window, 0.08);
    return (AXUIElementRef)window;
}
static uint64_t windowID(pid_t pid, AXUIElementRef window) {
    return ((uint64_t)(uint32_t)pid << 32) | (window ? (uint32_t)CFHash(window) : 0);
}
static NSString *canonicalProcess(NSString *executable, NSString *bundle) {
    NSDictionary *aliases = @{@"com.microsoft.VSCode": @"code", @"com.apple.dt.Xcode": @"xcode", @"com.adobe.Photoshop": @"adobe photoshop", @"com.adobe.illustrator": @"adobe illustrator", @"com.microsoft.teams2": @"microsoft teams", @"com.microsoft.teams": @"microsoft teams"};
    return aliases[bundle ?: @""] ?: executable ?: @"Unknown";
}
static NSString *processName(NSRunningApplication *application) {
    return canonicalProcess(application.executableURL.lastPathComponent ?: application.localizedName, application.bundleIdentifier);
}
bool buddy_accessibility(bool prompt) {
    return AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)@{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @(prompt)});
}
double buddy_idle(void) {
    return CGEventSourceSecondsSinceLastEventType(kCGEventSourceStateCombinedSessionState, kCGAnyInputEventType);
}
static BOOL audioPlaying(void) {
    AudioDeviceID device = kAudioObjectUnknown;
    UInt32 size = sizeof(device);
    AudioObjectPropertyAddress address = {kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain};
    if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, NULL, &size, &device) != noErr) return NO;
    UInt32 running = 0; size = sizeof(running);
    address.mSelector = kAudioDevicePropertyDeviceIsRunningSomewhere;
    return AudioObjectGetPropertyData(device, &address, 0, NULL, &size, &running) == noErr && running != 0;
}
// Browser metadata reads browser chrome only. Never traverse web document nodes.
static NSString *addressBar(AXUIElementRef root, NSUInteger depth, NSUInteger *visited, NSTimeInterval deadline) {
    if (!root || depth > 7 || ++*visited > 80 || NSDate.timeIntervalSinceReferenceDate > deadline) return nil;
    NSString *role = attribute(root, kAXRoleAttribute);
    NSString *subrole = attribute(root, kAXSubroleAttribute);
    if ([role isEqualToString:@"AXWebArea"] || [subrole isEqualToString:@"AXSecureTextField"]) return nil;
    if ([role isEqualToString:@"AXTextField"] || [role isEqualToString:@"AXComboBox"]) {
        NSString *description = [text(attribute(root, kAXDescriptionAttribute), 200) lowercaseString];
        NSString *identifier = [text(attribute(root, kAXIdentifierAttribute), 200) lowercaseString];
        if ([description containsString:@"address"] || [description containsString:@"url"] || [description containsString:@"search or enter website"] || [identifier containsString:@"urlbar"] || [identifier containsString:@"address"]) {
            return text(attribute(root, kAXValueAttribute), 4096);
        }
    }
    CFArrayRef children = NULL;
    if (AXUIElementCopyAttributeValues(root, kAXChildrenAttribute, 0, 25, &children) == kAXErrorSuccess) {
        for (id child in (__bridge NSArray *)children) {
            NSString *address = addressBar((__bridge AXUIElementRef)child, depth + 1, visited, deadline);
            if (address.length) { CFRelease(children); return address; }
        }
        CFRelease(children);
    }
    return nil;
}
char *buddy_foreground(bool metadata) {
    @autoreleasepool {
        if (!buddy_accessibility(false)) return failure(@"Allow Desktop Buddy in System Settings > Privacy & Security > Accessibility, then resume tracking.");
        NSRunningApplication *application = NSWorkspace.sharedWorkspace.frontmostApplication;
        if (!application) return failure(@"No foreground application is available");
        pid_t pid = application.processIdentifier;
        AXUIElementRef window = focusedWindow(pid);
        NSString *title = window ? text(attribute(window, kAXTitleAttribute), 160) : application.localizedName;
        NSString *process = processName(application);
        NSString *address = nil;
        if (metadata && [@[@"google chrome", @"microsoft edge", @"firefox", @"safari", @"brave browser", @"arc"] containsObject:process.lowercaseString]) {
            NSUInteger visited = 0;
            address = addressBar(window, 0, &visited, NSDate.timeIntervalSinceReferenceDate + 0.20);
        }
        BOOL fullscreen = [attribute(window, CFSTR("AXFullScreen")) boolValue];
        uint64_t identity = windowID(pid, window);
        AXUIElementRef latest = focusedWindow(pid);
        BOOL changed = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != pid || identity != windowID(pid, latest) || ![(latest ? text(attribute(latest, kAXTitleAttribute), 160) : application.localizedName) isEqualToString:title];
        if (window) CFRelease(window);
        if (latest) CFRelease(latest);
        if (changed) return failure(@"Foreground context changed during collection");
        return json(@{@"process": process, @"title": title ?: @"", @"window": @(identity), @"idle": @(buddy_idle()), @"fullscreen": @(fullscreen), @"media": @(audioPlaying()), @"address": address ?: NSNull.null});
    }
}
bool buddy_fullscreen(void) {
    @autoreleasepool {
        if (!buddy_accessibility(false)) return false;
        AXUIElementRef window = focusedWindow(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier);
        BOOL fullscreen = [attribute(window, CFSTR("AXFullScreen")) boolValue];
        if (window) CFRelease(window);
        return fullscreen;
    }
}
// Selected text uses only AXSelectedText; automatic context skips editable and secure controls.
static CGRect elementFrame(AXUIElementRef element) {
    id position = attribute(element, kAXPositionAttribute), size = attribute(element, kAXSizeAttribute);
    CGPoint origin = CGPointZero; CGSize dimensions = CGSizeZero;
    if (!position || !size || CFGetTypeID((__bridge CFTypeRef)position) != AXValueGetTypeID() || CFGetTypeID((__bridge CFTypeRef)size) != AXValueGetTypeID()) return CGRectNull;
    if (!AXValueGetValue((__bridge AXValueRef)position, kAXValueCGPointType, &origin) || !AXValueGetValue((__bridge AXValueRef)size, kAXValueCGSizeType, &dimensions)) return CGRectNull;
    return (CGRect){origin, dimensions};
}
static void visibleText(AXUIElementRef root, NSUInteger depth, NSUInteger *visited, NSTimeInterval deadline, CGRect visible, NSMutableString *output) {
    if (!root || depth > 7 || ++*visited > 80 || output.length >= 3000 || NSDate.timeIntervalSinceReferenceDate > deadline) return;
    NSString *role = attribute(root, kAXRoleAttribute);
    NSString *subrole = attribute(root, kAXSubroleAttribute);
    if ([subrole isEqualToString:@"AXSecureTextField"] || [role isEqualToString:@"AXTextField"] || [role isEqualToString:@"AXTextArea"] || [role isEqualToString:@"AXComboBox"]) return;
    if ([role isEqualToString:@"AXStaticText"] && CGRectIntersectsRect(elementFrame(root), visible)) {
        NSString *value = text(attribute(root, kAXValueAttribute), 3000 - output.length);
        if (value.length) [output appendFormat:@"%@\n", value];
    }
    CFArrayRef children = NULL;
    if (AXUIElementCopyAttributeValues(root, kAXChildrenAttribute, 0, 25, &children) == kAXErrorSuccess) {
        for (id child in (__bridge NSArray *)children) visibleText((__bridge AXUIElementRef)child, depth + 1, visited, deadline, visible, output);
        CFRelease(children);
    }
}
char *buddy_context(uint64_t identity, bool selected) {
    @autoreleasepool {
        if (!buddy_accessibility(false)) return failure(@"Allow Desktop Buddy in Accessibility settings, or paste the text into Buddy.");
        pid_t pid = (pid_t)(identity >> 32);
        if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != pid) return failure(@"Screen context changed");
        AXUIElementRef window = focusedWindow(pid);
        if (!window || windowID(pid, window) != identity) { if (window) CFRelease(window); return failure(@"Screen context changed"); }
        NSMutableString *output = [NSMutableString string];
        if (selected) {
            AXUIElementRef app = AXUIElementCreateApplication(pid);
            AXUIElementSetMessagingTimeout(app, 0.08);
            id focused = attribute(app, kAXFocusedUIElementAttribute);
            if (focused && CFGetTypeID((__bridge CFTypeRef)focused) == AXUIElementGetTypeID()) {
                AXUIElementRef element = (__bridge AXUIElementRef)focused;
                if (![attribute(element, kAXSubroleAttribute) isEqualToString:@"AXSecureTextField"]) [output appendString:text(attribute(element, kAXSelectedTextAttribute), 4001)];
            }
            CFRelease(app);
        } else {
            NSUInteger visited = 0;
            visibleText(window, 0, &visited, NSDate.timeIntervalSinceReferenceDate + 0.20, elementFrame(window), output);
        }
        AXUIElementRef latest = focusedWindow(pid);
        BOOL changed = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != pid || windowID(pid, latest) != identity;
        CFRelease(window); if (latest) CFRelease(latest);
        if (changed) return failure(@"Screen context changed");
        return json(output);
    }
}
char *buddy_apps(void) {
    @autoreleasepool {
        NSMutableArray *apps = [NSMutableArray array];
        NSArray *roots = @[@"/Applications", @"/System/Applications", [NSHomeDirectory() stringByAppendingPathComponent:@"Applications"]];
        for (NSString *root in roots) {
            NSDirectoryEnumerator *enumerator = [NSFileManager.defaultManager enumeratorAtURL:[NSURL fileURLWithPath:root] includingPropertiesForKeys:@[NSURLIsDirectoryKey, NSURLIsSymbolicLinkKey] options:NSDirectoryEnumerationSkipsHiddenFiles errorHandler:nil];
            NSUInteger visited = 0;
            for (NSURL *url in enumerator) {
                if (++visited > 5000) break;
                NSNumber *symlink = nil; [url getResourceValue:&symlink forKey:NSURLIsSymbolicLinkKey error:nil];
                if (symlink.boolValue) { [enumerator skipDescendants]; continue; }
                if ([url.pathExtension isEqualToString:@"app"]) {
                    [enumerator skipDescendants];
                    NSDictionary *info = [NSDictionary dictionaryWithContentsOfURL:[url URLByAppendingPathComponent:@"Contents/Info.plist"]];
                    NSString *process = canonicalProcess(info[@"CFBundleExecutable"], info[@"CFBundleIdentifier"]);
                    NSString *name = info[@"CFBundleDisplayName"] ?: info[@"CFBundleName"] ?: url.lastPathComponent.stringByDeletingPathExtension;
                    if ([process isKindOfClass:NSString.class] && process.length && process.length <= 100 && [name isKindOfClass:NSString.class]) [apps addObject:@{@"process_name": process, @"name": name}];
                } else if ([[url.path substringFromIndex:root.length] componentsSeparatedByString:@"/"].count > 3) [enumerator skipDescendants];
            }
        }
        return json(apps);
    }
}
char *buddy_keychain(const char *account, const char *secret, int operation) {
    @autoreleasepool {
        NSMutableDictionary *query = [@{(__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword, (__bridge id)kSecAttrService: @"com.artmarketvm.desktopbuddy.providers", (__bridge id)kSecAttrAccount: @(account)} mutableCopy];
        OSStatus status;
        if (operation == 0) {
            query[(__bridge id)kSecReturnData] = @YES;
            query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
            CFTypeRef data = NULL; status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &data);
            if (status == errSecItemNotFound) return json(NSNull.null);
            if (status != errSecSuccess) return failure(@"macOS Keychain could not read the API key");
            NSData *bytes = CFBridgingRelease(data);
            NSString *value = [[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding];
            return value ? json(value) : failure(@"Saved credential is invalid; replace it in Settings");
        }
        if (operation == 2) {
            status = SecItemDelete((__bridge CFDictionaryRef)query);
        } else {
            NSDictionary *attributes = @{(__bridge id)kSecValueData: [@(secret) dataUsingEncoding:NSUTF8StringEncoding]};
            status = SecItemUpdate((__bridge CFDictionaryRef)query, (__bridge CFDictionaryRef)attributes);
            if (status == errSecItemNotFound) {
                [query addEntriesFromDictionary:attributes];
                query[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;
                status = SecItemAdd((__bridge CFDictionaryRef)query, NULL);
            }
        }
        return status == errSecSuccess || (operation == 2 && status == errSecItemNotFound) ? json(NSNull.null) : failure(@"macOS Keychain could not save or remove the API key");
    }
}
char *buddy_autostart(const char *executable, bool enabled) {
    @autoreleasepool {
        NSString *directory = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/LaunchAgents"];
        NSString *path = [directory stringByAppendingPathComponent:@"com.artmarketvm.desktopbuddy.plist"];
        if (!enabled) {
            if (![NSFileManager.defaultManager fileExistsAtPath:path]) return json(NSNull.null);
            return [NSFileManager.defaultManager removeItemAtPath:path error:nil] ? json(NSNull.null) : failure(@"Could not remove Desktop Buddy login startup");
        }
        NSString *binary = @(executable);
        if (![binary containsString:@".app/Contents/MacOS/"]) return failure(@"Move Desktop Buddy.app to Applications before enabling login startup");
        NSDictionary *agent = @{@"Label": @"com.artmarketvm.desktopbuddy", @"ProgramArguments": @[binary, @"--background"], @"RunAtLoad": @YES, @"LimitLoadToSessionType": @"Aqua"};
        NSData *data = [NSPropertyListSerialization dataWithPropertyList:agent format:NSPropertyListXMLFormat_v1_0 options:0 error:nil];
        if (![NSFileManager.defaultManager createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:nil] || ![data writeToFile:path atomically:YES]) return failure(@"Could not save Desktop Buddy login startup");
        return json(NSNull.null);
    }
}
// Carbon hotkeys are delivered on the native event thread; Rust immediately dispatches work.
static void (*shortcutCallback)(unsigned int) = NULL;
static OSStatus hotkey(EventHandlerCallRef next, EventRef event, void *context) {
    (void)next; (void)context;
    EventHotKeyID identity;
    if (GetEventParameter(event, kEventParamDirectObject, typeEventHotKeyID, NULL, sizeof(identity), NULL, &identity) == noErr && shortcutCallback) shortcutCallback(identity.id);
    return noErr;
}
unsigned int buddy_shortcuts(void (*callback)(unsigned int)) {
    shortcutCallback = callback;
    EventTypeSpec type = {kEventClassKeyboard, kEventHotKeyPressed};
    if (InstallEventHandler(GetApplicationEventTarget(), hotkey, 1, &type, NULL, NULL) != noErr) return 0;
    EventHotKeyRef buddy = NULL, goal = NULL;
    unsigned int available = 0;
    if (RegisterEventHotKey(kVK_ANSI_B, cmdKey | optionKey, (EventHotKeyID){0x42444459, 1}, GetApplicationEventTarget(), 0, &buddy) == noErr) available |= 1;
    if (RegisterEventHotKey(kVK_ANSI_G, cmdKey | optionKey, (EventHotKeyID){0x42444459, 2}, GetApplicationEventTarget(), 0, &goal) == noErr) available |= 2;
    return available;
}
char *buddy_voice_languages(void) {
    @autoreleasepool {
        NSMutableArray *languages = [NSMutableArray array];
        for (NSString *language in @[@"en-US", @"ru-RU"]) {
            SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:language]];
            if (recognizer.supportsOnDeviceRecognition) [languages addObject:language];
        }
        return json(languages);
    }
}
char *buddy_transcribe(const unsigned char *audio, size_t length, const char *language) {
    @autoreleasepool {
        if (NSThread.isMainThread) return failure(@"Start voice recognition from the workspace");
        dispatch_semaphore_t permission = dispatch_semaphore_create(0);
        __block SFSpeechRecognizerAuthorizationStatus authorization = SFSpeechRecognizer.authorizationStatus;
        if (authorization == SFSpeechRecognizerAuthorizationStatusNotDetermined) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) { authorization = status; dispatch_semaphore_signal(permission); }];
            });
            if (dispatch_semaphore_wait(permission, dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC)) != 0) return failure(@"Allow speech recognition in System Settings, then try again");
        }
        if (authorization != SFSpeechRecognizerAuthorizationStatusAuthorized) return failure(@"Allow Desktop Buddy speech recognition in System Settings > Privacy & Security");
        NSString *choice = @(language);
        NSString *locale = [choice isEqualToString:@"ru"] ? @"ru-RU" : [choice isEqualToString:@"en"] ? @"en-US" : NSLocale.currentLocale.localeIdentifier;
        SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:locale]];
        if (!recognizer.supportsOnDeviceRecognition) return failure(@"Local speech recognition is unavailable for this language. Enable Dictation for it in System Settings > Keyboard, or paste a transcript.");
        NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSUUID.UUID.UUIDString stringByAppendingPathExtension:@"wav"]];
        NSURL *url = [NSURL fileURLWithPath:path];
        if (![[NSData dataWithBytes:audio length:length] writeToURL:url options:NSDataWritingAtomic | NSDataWritingFileProtectionComplete error:nil]) return failure(@"Could not prepare the voice recording");
        chmod(path.fileSystemRepresentation, 0600);
        SFSpeechURLRecognitionRequest *request = [[SFSpeechURLRecognitionRequest alloc] initWithURL:url];
        request.requiresOnDeviceRecognition = YES;
        request.shouldReportPartialResults = NO;
        dispatch_semaphore_t complete = dispatch_semaphore_create(0);
        __block NSString *transcript = nil;
        SFSpeechRecognitionTask *task = [recognizer recognitionTaskWithRequest:request resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
            if (result.isFinal || error) { transcript = result.isFinal ? result.bestTranscription.formattedString : nil; dispatch_semaphore_signal(complete); }
        }];
        dispatch_semaphore_wait(complete, dispatch_time(DISPATCH_TIME_NOW, 75 * NSEC_PER_SEC));
        [task cancel];
        [NSFileManager.defaultManager removeItemAtURL:url error:nil];
        return transcript.length ? json(transcript) : failure(@"No local transcript was available. Check the installed Dictation language, try again, or paste a transcript.");
    }
}

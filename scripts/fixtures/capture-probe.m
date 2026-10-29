// Local-only probe that drives the production adapter (src-tauri/native/macos.m) against capture-fixture.m.
// Build: clang -fobjc-arc -framework AppKit -framework ApplicationServices -framework Security -framework Carbon \
//   -framework Speech -framework CoreAudio -framework ScreenCaptureKit src-tauri/native/macos.m scripts/fixtures/capture-probe.m -o probe
// Usage: start ./fixture [duplicate], then ./probe <overlay|duplicate|minimized|foreground> <out.jpg>.
// The report counts green/blue/magenta sample pixels; the magenta overlay must never appear in the image.
// Requires Screen Recording and Accessibility for the probe process. Nothing leaves the machine.
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
char *buddy_foreground(bool metadata);
char *buddy_capture_window(uint64_t identity);
void buddy_free(char *value);
static id parse(char *raw) {
    if (!raw) return nil;
    NSData *data = [NSData dataWithBytes:raw length:strlen(raw)];
    buddy_free(raw);
    return [NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingFragmentsAllowed error:nil];
}
static NSDictionary *analyse(NSString *base64, NSString *path) {
    NSData *jpeg = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
    [jpeg writeToFile:path atomically:YES];
    NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:jpeg];
    NSUInteger green = 0, blue = 0, magenta = 0, total = 0;
    for (NSInteger y = 0; y < rep.pixelsHigh; y += 2) for (NSInteger x = 0; x < rep.pixelsWide; x += 2) {
        NSColor *c = [rep colorAtX:x y:y]; CGFloat r, g, b, a; [c getRed:&r green:&g blue:&b alpha:&a]; total++;
        if (g > 0.7 && r < 0.4 && b < 0.4) green++;
        else if (b > 0.7 && r < 0.4 && g < 0.4) blue++;
        else if (r > 0.7 && b > 0.7 && g < 0.4) magenta++;
    }
    return @{@"width": @(rep.pixelsWide), @"height": @(rep.pixelsHigh), @"bytes": @(jpeg.length), @"sampled": @(total), @"green": @(green), @"blue": @(blue), @"magenta": @(magenta)};
}
int main(int argc, char **argv) {
    @autoreleasepool {
        NSString *mode = argc > 1 ? @(argv[1]) : @"overlay";
        NSString *out = argc > 2 ? @(argv[2]) : @"/tmp/capture.jpg";
        NSApplication *app = NSApplication.sharedApplication;
        app.activationPolicy = NSApplicationActivationPolicyAccessory;
        NSWindow *overlay = nil;
        if ([mode isEqualToString:@"overlay"]) {
            // Another application's floating panel over the fixture's lower-right quarter.
            overlay = [[NSWindow alloc] initWithContentRect:NSMakeRect(600, 150, 500, 320) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
            overlay.backgroundColor = [NSColor colorWithSRGBRed:1 green:0 blue:1 alpha:1];
            overlay.level = NSFloatingWindowLevel; overlay.ignoresMouseEvents = YES;
            [overlay orderFrontRegardless];
        }
        // Give the fixture focus (it is launched separately) and let the compositor settle.
        BOOL found = NO;
        for (int attempt = 0; attempt < 25 && !found; attempt++) {
            for (NSRunningApplication *r in NSWorkspace.sharedWorkspace.runningApplications)
                if ([r.localizedName isEqualToString:@"fixture"]) { found = YES; [r activateWithOptions:0]; }
            [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
        }
        [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1.5]];
        // Wait until Accessibility resolves the fixture's focused window (fresh apps answer late).
        NSDictionary *fg = nil;
        for (int attempt = 0; attempt < 25; attempt++) {
            fg = parse(buddy_foreground(false));
            if ([fg[@"title"] isEqualToString:@"Buddy Capture Fixture"]) break;
            [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
        }
        NSMutableDictionary *report = [@{@"mode": mode, @"foreground_process": fg[@"process"] ?: fg[@"error"] ?: @"?", @"foreground_title": fg[@"title"] ?: @""} mutableCopy];
        uint64_t identity = [fg[@"window"] unsignedLongLongValue];
        if ([mode isEqualToString:@"minimized"]) {
            pid_t pid = (pid_t)(identity >> 32);
            AXUIElementRef a = AXUIElementCreateApplication(pid); CFTypeRef w = NULL;
            AXUIElementCopyAttributeValue(a, kAXFocusedWindowAttribute, &w);
            if (w) AXUIElementSetAttributeValue((AXUIElementRef)w, kAXMinimizedAttribute, kCFBooleanTrue);
            [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1.0]];
            if (w) CFRelease(w); CFRelease(a);
        }
        if ([mode isEqualToString:@"foreground"]) {
            // Capture an identity that is no longer frontmost: activate Finder first.
            [[NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.finder"].firstObject activateWithOptions:0];
            [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1.0]];
        }
        id result = parse(buddy_capture_window(identity));
        if ([result isKindOfClass:NSString.class]) report[@"image"] = analyse(result, out);
        else report[@"failure"] = result ?: @"null";
        if ([mode isEqualToString:@"minimized"]) {
            pid_t pid = (pid_t)(identity >> 32);
            AXUIElementRef a = AXUIElementCreateApplication(pid); CFArrayRef ws = NULL;
            if (AXUIElementCopyAttributeValues(a, kAXWindowsAttribute, 0, 8, &ws) == kAXErrorSuccess) {
                for (id w in (__bridge NSArray *)ws) AXUIElementSetAttributeValue((__bridge AXUIElementRef)w, kAXMinimizedAttribute, kCFBooleanFalse);
                CFRelease(ws);
            }
            CFRelease(a);
        }
        NSData *json = [NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingSortedKeys error:nil];
        printf("%s\n", [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
        [overlay orderOut:nil];
    }
    return 0;
}

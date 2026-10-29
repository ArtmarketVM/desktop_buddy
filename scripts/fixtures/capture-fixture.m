// Local-only macOS capture fixture: solid-colour windows with a fixed title and no real content.
// Build: clang -fobjc-arc -framework AppKit scripts/fixtures/capture-fixture.m -o fixture
// Run plain, or with "duplicate" for two stacked windows sharing title and frame (blue behind green).
#import <AppKit/AppKit.h>
static NSWindow *makeWindow(NSRect frame, NSColor *color, NSString *title) {
    NSWindow *w = [[NSWindow alloc] initWithContentRect:frame styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable backing:NSBackingStoreBuffered defer:NO];
    w.title = title; w.backgroundColor = color; w.releasedWhenClosed = NO;
    NSTextField *label = [NSTextField labelWithString:@"BUDDY CAPTURE FIXTURE"];
    label.font = [NSFont boldSystemFontOfSize:28]; label.textColor = NSColor.blackColor;
    label.frame = NSMakeRect(40, frame.size.height/2 - 20, frame.size.width - 80, 40);
    [w.contentView addSubview:label];
    [w makeKeyAndOrderFront:nil];
    return w;
}
int main(int argc, char **argv) {
    @autoreleasepool {
        NSApplication *app = NSApplication.sharedApplication;
        app.activationPolicy = NSApplicationActivationPolicyRegular;
        NSRect frame = NSMakeRect(200, 200, 800, 500);
        NSMutableArray *keep = [NSMutableArray array];
        if (argc > 1 && strcmp(argv[1], "duplicate") == 0) {
            // Two stacked windows with identical title and frame; the blue one is behind.
            [keep addObject:makeWindow(frame, [NSColor colorWithSRGBRed:0 green:0 blue:1 alpha:1], @"Buddy Capture Fixture")];
        }
        [keep addObject:makeWindow(frame, [NSColor colorWithSRGBRed:0 green:1 blue:0 alpha:1], @"Buddy Capture Fixture")];
        [app activateIgnoringOtherApps:YES];
        [app run];
    }
    return 0;
}

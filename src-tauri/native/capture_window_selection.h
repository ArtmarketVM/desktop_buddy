#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>

// AX and ScreenCaptureKit titles can differ for the same browser window.
// Accept only one owner + geometry match; overlapping sibling windows fail closed.
static id buddyUniqueCaptureWindow(NSArray *windows, pid_t pid, CGRect expected,
    pid_t (^owner)(id), CGRect (^bounds)(id)) {
    if (CGRectIsNull(expected) || CGRectIsEmpty(expected) || CGRectIsInfinite(expected)) return nil;
    id selected = nil;
    for (id window in windows) {
        if (owner(window) != pid) continue;
        CGRect frame = bounds(window);
        if (CGRectIsNull(frame) || CGRectIsEmpty(frame) || CGRectIsInfinite(frame)
            || fabs(frame.origin.x - expected.origin.x) > 1
            || fabs(frame.origin.y - expected.origin.y) > 1
            || fabs(frame.size.width - expected.size.width) > 1
            || fabs(frame.size.height - expected.size.height) > 1) continue;
        if (selected) return nil;
        selected = window;
    }
    return selected;
}

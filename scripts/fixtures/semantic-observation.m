// Local-only native acceptance fixture. No button places a real order.
// Define AUDIT_APP_PATH at compilation to enable the manual, normal-app-launch rehearsal.
#import <AppKit/AppKit.h>
@interface Fixture : NSObject
@property NSTextField *status;
@property NSTextField *result;
@property NSButton *confirm;
@property NSButton *start;
- (void)confirmOrder:(id)sender;
- (void)startAudit:(id)sender;
- (void)refresh:(NSTimer *)timer;
@end
@implementation Fixture
- (void)confirmOrder:(id)sender {
    self.status.stringValue = @"Order #4231 confirmed just now.\nChocolate birthday cake. Tuesday pickup. Payment approved.\nSYNTHETIC_ONLY_BUDDY_SEMANTIC";
    self.confirm.enabled = NO;
}
- (void)startAudit:(id)sender {
#ifdef AUDIT_APP_PATH
    self.start.enabled = NO;
    self.confirm.enabled = NO;
    self.result.stringValue = @"Sampling this window. Keep it active; wait for the order button.";
    NSFileManager *files = NSFileManager.defaultManager;
    [files removeItemAtPath:@"/private/tmp/buddy-semantic-native-phase" error:nil];
    [files removeItemAtPath:@"/private/tmp/buddy-semantic-native-launchservices.json" error:nil];
    NSWorkspaceOpenConfiguration *configuration = NSWorkspaceOpenConfiguration.configuration;
    configuration.activates = NO;
    configuration.createsNewApplicationInstance = YES;
    configuration.arguments = @[@"--check-semantic-observation", @"--native-semantic-fixture"];
    [NSWorkspace.sharedWorkspace openApplicationAtURL:[NSURL fileURLWithPath:@AUDIT_APP_PATH] configuration:configuration completionHandler:^(NSRunningApplication *application, NSError *error) {
        if (error) dispatch_async(dispatch_get_main_queue(), ^{self.result.stringValue = @"Audit app launch failed. No cloud request was made.";});
    }];
    [NSTimer scheduledTimerWithTimeInterval:0.5 target:self selector:@selector(refresh:) userInfo:nil repeats:YES];
#endif
}
- (void)refresh:(NSTimer *)timer {
    NSData *data = [NSData dataWithContentsOfFile:@"/private/tmp/buddy-semantic-native-launchservices.json"];
    if (data) {
        NSDictionary *report = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        self.result.stringValue = [report[@"all_passed"] boolValue]
            ? @"Verified: native text + images, two AI checks, completion and Undo."
            : @"Check did not pass. No installed goal was changed. See the audit report.";
        [timer invalidate];
        return;
    }
    NSString *phase = [NSString stringWithContentsOfFile:@"/private/tmp/buddy-semantic-native-phase" encoding:NSUTF8StringEncoding error:nil];
    if ([phase isEqualToString:@"awaiting_synthetic_order"] && [self.status.stringValue containsString:@"Payment pending"]) {
        self.confirm.enabled = YES;
        self.result.stringValue = @"First observation captured. Now confirm the synthetic order.";
    }
}
@end
int main(void) { @autoreleasepool {
    NSApplication *app = NSApplication.sharedApplication;
    [app setActivationPolicy:NSApplicationActivationPolicyRegular];
    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(120,150,760,410) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
    window.title = @"Buddy Semantic Fixture";
    NSTextField *title = [NSTextField labelWithString:@"Synthetic bakery checkout"];
    title.font = [NSFont systemFontOfSize:24]; title.frame = NSMakeRect(35,325,690,45);
    [window.contentView addSubview:title];
    Fixture *fixture = [Fixture new];
    fixture.status = [NSTextField wrappingLabelWithString:@"Cart: chocolate birthday cake. Tuesday pickup.\nPayment pending. No order has been placed.\nSYNTHETIC_ONLY_BUDDY_SEMANTIC"];
    fixture.status.font = [NSFont systemFontOfSize:18]; fixture.status.frame = NSMakeRect(35,155,690,150);
    [window.contentView addSubview:fixture.status];
    fixture.confirm = [NSButton buttonWithTitle:@"Confirm synthetic order" target:fixture action:@selector(confirmOrder:)];
    fixture.confirm.frame = NSMakeRect(270,85,260,44); [window.contentView addSubview:fixture.confirm];
#ifdef AUDIT_APP_PATH
    fixture.start = [NSButton buttonWithTitle:@"Start native check" target:fixture action:@selector(startAudit:)];
    fixture.start.frame = NSMakeRect(35,85,220,44); [window.contentView addSubview:fixture.start];
    fixture.confirm.enabled = NO;
#endif
    fixture.result = [NSTextField wrappingLabelWithString:@"This fixture contains invented data only. No purchase or installed goal will be changed."];
    fixture.result.frame = NSMakeRect(35,20,690,55); [window.contentView addSubview:fixture.result];
    [window makeKeyAndOrderFront:nil]; [app activateIgnoringOtherApps:YES]; [app run];
} }

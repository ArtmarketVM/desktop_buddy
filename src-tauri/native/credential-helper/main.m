// Immutable credential bridge. Rebuild only for a reviewed protocol/security change.
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <sys/sysctl.h>
#import <unistd.h>

static BOOL authorizedParent(void) {
    pid_t parent = getppid();
    if (parent <= 1) return NO;
    int mib[] = {CTL_KERN, KERN_PROC, KERN_PROC_PID, parent};
    struct kinfo_proc process = {0}; size_t size = sizeof(process);
    if (sysctl(mib, 4, &process, &size, NULL, 0) || size != sizeof(process) || process.kp_eproc.e_ucred.cr_uid != getuid()) return NO;
    SecCodeRef code = NULL; SecRequirementRef requirement = NULL;
    NSDictionary *guest = @{(__bridge id)kSecGuestAttributePid: @(parent)};
    OSStatus status = SecCodeCopyGuestWithAttributes(NULL, (__bridge CFDictionaryRef)guest, kSecCSDefaultFlags, &code);
    if (status == errSecSuccess) status = SecRequirementCreateWithString(CFSTR("identifier \"com.artmarketvm.desktopbuddy\" and certificate root = H\"9b85d29dad2e9328ec27631337e3e9313383ab20\""), kSecCSDefaultFlags, &requirement);
    if (status == errSecSuccess) status = SecCodeCheckValidity(code, kSecCSStrictValidate, requirement);
    CFDictionaryRef information = NULL;
    if (status == errSecSuccess) status = SecCodeCopySigningInformation(code, kSecCSSigningInformation, &information);
    NSDictionary *info = CFBridgingRelease(information);
    NSDictionary *entitlements = info[(__bridge id)kSecCodeInfoEntitlementsDict];
    BOOL hardened = ([info[(__bridge id)kSecCodeInfoFlags] unsignedIntValue] & kSecCodeSignatureRuntime) != 0;
    BOOL injectable = [entitlements[@"com.apple.security.get-task-allow"] boolValue] || [entitlements[@"com.apple.security.cs.disable-library-validation"] boolValue] || [entitlements[@"com.apple.security.cs.allow-dyld-environment-variables"] boolValue];
    if (requirement) CFRelease(requirement);
    if (code) CFRelease(code);
    return status == errSecSuccess && hardened && !injectable && getppid() == parent;
}
static void respond(id value) {
    NSData *output = [NSJSONSerialization dataWithJSONObject:value options:NSJSONWritingFragmentsAllowed error:nil];
    if (output) [[NSFileHandle fileHandleWithStandardOutput] writeData:output];
}
int main(void) { @autoreleasepool {
    if (!authorizedParent()) { respond(@{@"error":@"Credential access requires the signed Desktop Buddy application"}); return 1; }
    // Bound input before parsing, and never accept credentials in argv or environment.
    NSData *input = [[NSFileHandle fileHandleWithStandardInput] readDataOfLength:8193];
    NSDictionary *request = input.length <= 8192 ? [NSJSONSerialization JSONObjectWithData:input options:0 error:nil] : nil;
    if (![request isKindOfClass:NSDictionary.class]) { respond(@{@"error":@"Invalid credential request"}); return 1; }
    NSString *account = request[@"account"], *operation = request[@"operation"];
    if (![@[@"NEBIUS_API_KEY", @"TAVILY_API_KEY", @"BUDDY_KEYCHAIN_SELF_TEST"] containsObject:account] || ![@[@"read", @"write", @"remove", @"exists"] containsObject:operation]) { respond(@{@"error":@"Invalid credential request"}); return 1; }
    NSMutableDictionary *query = [@{(__bridge id)kSecClass:(__bridge id)kSecClassGenericPassword, (__bridge id)kSecAttrService:@"com.artmarketvm.desktopbuddy.providers", (__bridge id)kSecAttrAccount:account} mutableCopy];
    OSStatus status;
    if ([operation isEqualToString:@"exists"]) {
        // Metadata checks must never produce an authorization dialog.
        query[(__bridge id)kSecUseAuthenticationUI] = (__bridge id)kSecUseAuthenticationUIFail;
        status = SecItemCopyMatching((__bridge CFDictionaryRef)query, NULL);
        respond(@(status == errSecSuccess || status == errSecInteractionNotAllowed)); return 0;
    }
    if ([operation isEqualToString:@"read"]) {
        query[(__bridge id)kSecReturnData] = @YES;
        query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
        CFTypeRef data = NULL; status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &data);
        NSData *bytes = CFBridgingRelease(data);
        if (status == errSecItemNotFound) { respond(NSNull.null); return 0; }
        NSString *value = status == errSecSuccess ? [[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding] : nil;
        if (value && value.length <= 2048) { respond(value); return 0; }
    } else if ([operation isEqualToString:@"remove"]) {
        status = SecItemDelete((__bridge CFDictionaryRef)query);
        if (status == errSecSuccess || status == errSecItemNotFound) { respond(NSNull.null); return 0; }
    } else {
        NSString *value = request[@"secret"];
        if (![value isKindOfClass:NSString.class] || !value.length || value.length > 2048 || [value rangeOfCharacterFromSet:[[NSCharacterSet characterSetWithRange:NSMakeRange(33,94)] invertedSet]].location != NSNotFound) { respond(@{@"error":@"Invalid credential request"}); return 1; }
        NSDictionary *attributes = @{(__bridge id)kSecValueData:[value dataUsingEncoding:NSUTF8StringEncoding]};
        status = SecItemUpdate((__bridge CFDictionaryRef)query, (__bridge CFDictionaryRef)attributes);
        if (status == errSecItemNotFound) {
            [query addEntriesFromDictionary:attributes];
            // The default ACL trusts this exact signed helper, never all applications.
            status = SecItemAdd((__bridge CFDictionaryRef)query, NULL);
        }
        if (status == errSecSuccess) { respond(NSNull.null); return 0; }
    }
    respond(@{@"error":@"macOS Keychain access was not granted. Allow Buddy Credential Access in the system dialog, then retry in Settings."});
    return 1;
} }

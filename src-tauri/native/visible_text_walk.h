#import <Foundation/Foundation.h>

// A bounded traversal shared with the native regression harness. Attribute and
// geometry access stay in the platform adapter; no window text is logged here.
static NSString *buddyVisibleText(id root, NSTimeInterval deadline,
    NSString *(^attribute)(id, NSString *), NSArray *(^children)(id), BOOL (^visible)(id)) {
    NSMutableString *output = [NSMutableString string];
    NSMutableArray *stack = [NSMutableArray arrayWithObject:@[root, @0, @NO]];
    NSUInteger visited = 0;
    BOOL foundContent = NO;
    while (stack.count && visited++ < 256 && NSDate.timeIntervalSinceReferenceDate <= deadline) {
        NSArray *entry = stack.lastObject;
        [stack removeLastObject];
        id node = entry[0];
        NSUInteger depth = [entry[1] unsignedIntegerValue];
        NSString *role = attribute(node, @"AXRole");
        if ([attribute(node, @"AXHidden") isEqualToString:@"true"]
            || [attribute(node, @"AXSubrole") isEqualToString:@"AXSecureTextField"]
            || [@[@"AXTextField", @"AXTextArea", @"AXComboBox"] containsObject:role]) continue;
        BOOL content = [entry[2] boolValue] || [@[@"AXWebArea", @"AXDocument"] containsObject:role];
        if (content && !foundContent) { [output setString:@""]; foundContent = YES; }
        if ((!foundContent || content) && [role isEqualToString:@"AXStaticText"] && visible(node) && output.length < 3000) {
            NSString *value = attribute(node, @"AXValue");
            NSUInteger length = MIN(value.length, 3000 - output.length);
            if (length) {
                [output appendString:[value substringToIndex:length]];
                if (output.length < 3000) [output appendString:@"\n"];
            }
        }
        if (depth >= 32 || (content && output.length >= 3000)) continue;
        NSArray *nodes = children(node);
        // Preserve reading order, and bound memory even for pathological trees.
        NSUInteger count = MIN(nodes.count, MIN((NSUInteger)64, 256 - stack.count));
        for (NSUInteger index = count; index > 0; --index)
            [stack addObject:@[nodes[index - 1], @(depth + 1), @(content)]];
    }
    return output;
}

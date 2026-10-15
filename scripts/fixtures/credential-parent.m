#import <Foundation/Foundation.h>
#ifndef BUILD
#define BUILD 1
#endif
int main(int argc,const char **argv){ @autoreleasepool {
 fprintf(stderr,"fixture_build=%d\n",BUILD);
 NSTask *task=[NSTask new]; task.executableURL=[NSURL fileURLWithPath:argv[1] ? @(argv[1]) : @""];
 NSPipe *in=[NSPipe pipe],*out=[NSPipe pipe]; task.standardInput=in;task.standardOutput=out;task.standardError=[NSFileHandle fileHandleWithNullDevice];
 NSError *error=nil;if(![task launchAndReturnError:&error])return 2;
 NSString *operation=argc>2?@(argv[2]):@"read";
 NSDictionary *q=@{@"account":@"BUDDY_KEYCHAIN_SELF_TEST",@"operation":operation,@"secret":@"synthetic-credential-only"};
 [in.fileHandleForWriting writeData:[NSJSONSerialization dataWithJSONObject:q options:0 error:nil]];[in.fileHandleForWriting closeFile];
 NSData *data=[out.fileHandleForReading readDataToEndOfFile];[task waitUntilExit];
 id result=[NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingFragmentsAllowed error:nil];
 BOOL success=[operation isEqual:@"read"]?[result isEqual:@"synthetic-credential-only"]:result==NSNull.null;
 printf("operation=%s success=%d helper_exit=%d\n",operation.UTF8String,success,task.terminationStatus);
 if(!success && [result isKindOfClass:NSDictionary.class])printf("error=%s\n",[result[@"error"] UTF8String]);
 return success?0:1;
} }

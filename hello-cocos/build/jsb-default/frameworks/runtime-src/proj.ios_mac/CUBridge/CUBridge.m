#import "CUBridge.h"
#import "AppController.h"

@implementation CUBridge

+ (void)OpenUnity:(NSString *)str {
    NSLog(@"OpenUnity:%@", str);
    
    AppController *appController = (AppController *)[UIApplication sharedApplication].delegate;
    [appController resumeUnity];

}
@end

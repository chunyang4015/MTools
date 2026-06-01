#import <AppKit/AppKit.h>

// Returns the pasteboard change count — increments every time the clipboard is written to.
long macos_get_clipboard_change_count(void) {
    @autoreleasepool {
        return (long)[[NSPasteboard generalPasteboard] changeCount];
    }
}

// Returns a malloc'd JSON array string of file paths from clipboard, or NULL.
// Caller must free() the returned pointer.
const char *macos_get_clipboard_files(void) {
    @autoreleasepool {
        NSPasteboard *pb = [NSPasteboard generalPasteboard];
        NSArray *classes = @[[NSURL class]];
        NSDictionary *options = @{NSPasteboardURLReadingFileURLsOnlyKey: @YES};
        NSArray *urls = [pb readObjectsForClasses:classes options:options];

        if (urls == nil || urls.count == 0) {
            return NULL;
        }

        NSMutableArray *paths = [[NSMutableArray alloc] init];
        for (NSURL *url in urls) {
            NSString *path = url.path;
            if (path != nil) {
                [paths addObject:path];
            }
        }

        if (paths.count == 0) {
            return NULL;
        }

        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:paths options:0 error:nil];
        if (jsonData == nil) {
            return NULL;
        }

        NSString *jsonStr = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        return strdup([jsonStr UTF8String]);
    }
}

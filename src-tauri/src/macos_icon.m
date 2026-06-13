#import <AppKit/AppKit.h>

// Returns a malloc'd C string containing base64-encoded PNG data (32x32), or NULL.
// Caller must free() the returned pointer.
const char *macos_get_app_icon(const char *app_path) {
    @autoreleasepool {
        NSString *path = [NSString stringWithUTF8String:app_path];
        NSImage *icon = [[NSWorkspace sharedWorkspace] iconForFile:path];
        if (!icon) return NULL;

        NSSize size = NSMakeSize(32, 32);
        [icon setSize:size];

        NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
            initWithData:[icon TIFFRepresentation]];
        if (!bitmap) return NULL;
        [bitmap setSize:size];

        NSData *pngData = [bitmap representationUsingType:NSBitmapImageFileTypePNG
                                              properties:@{}];
        if (!pngData) return NULL;

        NSString *base64 = [pngData base64EncodedStringWithOptions:0];
        if (!base64) return NULL;

        return strdup([base64 UTF8String]);
    }
}

// Returns a malloc'd C string with the localized (zh) display name read directly from
// Contents/Resources/<lproj>/InfoPlist.strings. This bypasses NSBundle's locale resolution,
// which fails to resolve some bundles (e.g. WeChat returns "WeChat" instead of "微信").
// Returns NULL if no localized name is found (caller falls back to the filename).
// Caller must free() the returned pointer.
const char *macos_get_app_display_name(const char *app_path) {
    @autoreleasepool {
        NSString *resources = [[NSString stringWithUTF8String:app_path]
            stringByAppendingPathComponent:@"Contents/Resources"];

        // Simplified Chinese variants first, Traditional Chinese as a last resort.
        NSArray<NSString *> *locales = @[@"zh-Hans", @"zh-Hans_CN", @"zh_CN", @"zh", @"zh-Hant"];
        for (NSString *loc in locales) {
            NSString *dir = [NSString stringWithFormat:@"%@.lproj", loc];
            NSString *stringsPath = [[resources stringByAppendingPathComponent:dir]
                stringByAppendingPathComponent:@"InfoPlist.strings"];
            NSDictionary *d = [NSDictionary dictionaryWithContentsOfFile:stringsPath];
            NSString *name = d[@"CFBundleDisplayName"] ?: d[@"CFBundleName"];
            if ([name length] > 0) {
                return strdup([name UTF8String]);
            }
        }
        return NULL;
    }
}

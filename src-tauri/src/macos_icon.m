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

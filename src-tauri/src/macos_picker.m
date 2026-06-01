#import <AppKit/AppKit.h>
#import <objc/message.h>
#import <objc/runtime.h>
#import <dispatch/dispatch.h>

typedef void (*PickResultCallback)(const char *hex, void *ctx);

static void pick_with_screencapture(void *ctx, PickResultCallback callback) {
    // Fallback: capture screen, then pick pixel at mouse click position
    // Uses NSTask to run screencapture (system tool, has its own entitlements)
    NSTask *task = [[NSTask alloc] init];
    [task setLaunchPath:@"/usr/sbin/screencapture"];
    [task setArguments:@[@"-x", @"/tmp/mtools_screen.png"]];
    [task launch];
    [task waitUntilExit];

    NSImage *image = [[NSImage alloc] initWithContentsOfFile:@"/tmp/mtools_screen.png"];
    if (!image) {
        callback("error:screenshot failed", ctx);
        return;
    }

    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithData:[image TIFFRepresentation]];
    if (!bitmap) {
        callback("error:bitmap failed", ctx);
        return;
    }

    // Show a transparent overlay for picking
    NSRect screenRect = [[NSScreen mainScreen] frame];
    NSWindow *overlay = [[NSWindow alloc] initWithContentRect:screenRect
                                                    styleMask:NSWindowStyleMaskBorderless
                                                      backing:NSBackingStoreBuffered
                                                        defer:NO];
    [overlay setLevel:CGShieldingWindowLevel()];
    [overlay setOpaque:NO];
    [overlay setBackgroundColor:[NSColor colorWithCalibratedWhite:0.0 alpha:0.01]];
    [overlay setIgnoresMouseEvents:NO];
    [overlay setHasShadow:NO];

    // Show screenshot in the overlay
    NSImageView *imageView = [[NSImageView alloc] initWithFrame:screenRect];
    [imageView setImage:image];
    [overlay setContentView:imageView];
    [overlay makeKeyAndOrderFront:nil];
    [[NSCursor crosshairCursor] set];

    // Track mouse click
    __block NSWindow *overlayRef = overlay;
    __block NSBitmapImageRep *bitmapRef = bitmap;

    // Use local event monitor for mouseDown
    NSEventMask mask = NSEventMaskLeftMouseDown;
    [NSEvent addLocalMonitorForEventsMatchingMask:mask handler:^NSEvent *(NSEvent *event) {
        NSPoint loc = [event locationInWindow];
        // Convert from screen coordinates (origin bottom-left) to image coordinates (origin top-left)
        CGFloat screenHeight = screenRect.size.height;
        NSInteger x = (NSInteger)loc.x;
        NSInteger y = (NSInteger)(screenHeight - loc.y);

        if (x >= 0 && x < [bitmapRef pixelsWide] && y >= 0 && y < [bitmapRef pixelsHigh]) {
            NSColor *color = [bitmapRef colorAtX:x y:y];
            NSColor *rgb = [color colorUsingColorSpace:[NSColorSpace sRGBColorSpace]];
            int r = (int)(rgb.redComponent * 255.0 + 0.5);
            int g = (int)(rgb.greenComponent * 255.0 + 0.5);
            int b = (int)(rgb.blueComponent * 255.0 + 0.5);
            NSString *hex = [NSString stringWithFormat:@"#%02X%02X%02X", r, g, b];
            callback([hex UTF8String], ctx);
        } else {
            callback(NULL, ctx);
        }
        [overlayRef close];
        return event;
    }];
}

void macos_pick_color(void *ctx, PickResultCallback callback) {
    dispatch_async(dispatch_get_main_queue(), ^{
        Class cls = NSClassFromString(@"NSColorSampler");
        if (!cls) {
            // NSColorSampler not available, use screen capture fallback
            pick_with_screencapture(ctx, callback);
            return;
        }

        id sampler = [[cls alloc] init];
        // macOS 16+ renamed the method
        SEL sel = @selector(showSamplerWithSelectionHandler:);
        if (![sampler respondsToSelector:sel]) {
            sel = @selector(showWithSelectionHandler:);
        }

        if (![sampler respondsToSelector:sel]) {
            // Log available methods for debugging
            unsigned int methodCount = 0;
            Method *methods = class_copyMethodList(object_getClass(sampler), &methodCount);
            NSLog(@"NSColorSampler methods (%u):", methodCount);
            for (unsigned int i = 0; i < methodCount; i++) {
                NSLog(@"  - %s", sel_getName(method_getName(methods[i])));
            }
            free(methods);

            // Fallback to screen capture approach
            pick_with_screencapture(ctx, callback);
            return;
        }

        void (^handler)(NSColor * _Nullable) = ^(NSColor * _Nullable color) {
            if (color) {
                NSColor *rgb = [color colorUsingColorSpace:[NSColorSpace sRGBColorSpace]];
                int r = (int)(rgb.redComponent * 255.0 + 0.5);
                int g = (int)(rgb.greenComponent * 255.0 + 0.5);
                int b = (int)(rgb.blueComponent * 255.0 + 0.5);
                NSString *hex = [NSString stringWithFormat:@"#%02X%02X%02X", r, g, b];
                callback([hex UTF8String], ctx);
            } else {
                callback(NULL, ctx);
            }
        };

        @try {
            typedef void (*ShowFunc)(id, SEL, void (^)(NSColor * _Nullable));
            ShowFunc func = (ShowFunc)objc_msgSend;
            func(sampler, sel, handler);
        } @catch (NSException *exception) {
            NSLog(@"NSColorSampler exception: %@", exception);
            pick_with_screencapture(ctx, callback);
        }
    });
}

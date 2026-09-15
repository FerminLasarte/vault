// The print dialog, with a job title.
//
// "Save as PDF" suggests the print job's title as the file name. wry's `print`
// never sets one, and macOS then falls back to the window's title, so every
// document was offered as "Vault.pdf" whatever the page was called.

use objc2_app_kit::{NSPrintInfo, NSWindow};
use objc2_foundation::NSString;
use objc2_web_kit::WKWebView;
use tauri::webview::PlatformWebview;

// The same steps as wry's `print` — no margins, a separate thread allowed, the
// dialog as a sheet on the window — so a titled print looks like any other.
pub fn print_titled(webview: &PlatformWebview, title: &str) {
    // Safety: `with_webview` runs this on the main thread, where AppKit must be
    // called, and passes the WKWebView and NSWindow Tauri created for this
    // webview, which live as long as the window does.
    unsafe {
        let view = &*webview.inner().cast::<WKWebView>();
        let window = &*webview.ns_window().cast::<NSWindow>();

        let info = NSPrintInfo::sharedPrintInfo();
        info.setTopMargin(0.0);
        info.setRightMargin(0.0);
        info.setBottomMargin(0.0);
        info.setLeftMargin(0.0);

        let operation = view.printOperationWithPrintInfo(&info);
        operation.setJobTitle(Some(&NSString::from_str(title)));
        operation.setCanSpawnSeparateThread(true);
        operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            window,
            None,
            None,
            std::ptr::null_mut(),
        );
    }
}

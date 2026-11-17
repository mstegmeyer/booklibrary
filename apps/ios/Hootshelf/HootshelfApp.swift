import SwiftUI

@main
struct HootshelfApp: App {
    @State private var shell = Shell()

    var body: some Scene {
        WindowGroup {
            Group {
                if let server = shell.server {
                    WebView(server: server, shell: shell).ignoresSafeArea()
                } else if !shell.isLaunching {
                    ConnectView(shell: shell)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.ground)
            // The interface is light only; a dark scheme turns the status bar light.
            .preferredColorScheme(shell.lightStatusBar ? .dark : .light)
        }
    }
}

extension Color {
    static let ground = Color(red: 0xFB / 255, green: 0xFB / 255, blue: 0xF9 / 255)
    static let ink = Color(red: 0x1B / 255, green: 0x1E / 255, blue: 0x1C / 255)
    static let inkMuted = Color(red: 0x5A / 255, green: 0x61 / 255, blue: 0x5C / 255)
    static let control = Color(red: 0x8A / 255, green: 0x90 / 255, blue: 0x8B / 255)
    static let accent = Color(red: 0x1F / 255, green: 0x6B / 255, blue: 0x52 / 255)
    static let danger = Color(red: 0x9B / 255, green: 0x2C / 255, blue: 0x2C / 255)
}

import Foundation
import Observation

/// Which screen the app shows: the connect screen or the server's web interface.
@Observable
final class Shell {
    private static let addressKey = "serverAddress"

    var address: String
    private(set) var problem: ConnectProblem?
    private(set) var isChecking = false
    private(set) var server: URL?
    /// Launching with a remembered address shows nothing until it is checked,
    /// so a reachable server opens without the connect screen flashing up.
    private(set) var isLaunching: Bool
    /// Set by the web interface while its page is dark at the top.
    var lightStatusBar = false

    init() {
        let saved = UserDefaults.standard.string(forKey: Self.addressKey) ?? ""
        address = saved
        isLaunching = !saved.isEmpty
        if isLaunching {
            Task {
                await connect()
                isLaunching = false
            }
        }
    }

    func connect() async {
        guard let origin = Server.origin(from: address) else {
            problem = .invalidAddress
            return
        }
        isChecking = true
        defer { isChecking = false }
        problem = await Server.check(origin)
        guard problem == nil else { return }
        address = origin.absoluteString
        UserDefaults.standard.set(address, forKey: Self.addressKey)
        server = origin
    }

    func changeServer() {
        server = nil
        lightStatusBar = false
        problem = nil
    }

    func lostServer(_ error: Error) {
        server = nil
        lightStatusBar = false
        problem = .unreachable(reason: error.localizedDescription)
    }
}

import Foundation
import Network

enum ConnectProblem: Equatable {
    case invalidAddress
    case needsHTTPS
    case unreachable(reason: String)
    case notBookLibrary
}

enum Server {
    /// The origin the user means, with `https://` unless they typed a scheme.
    /// Paths are dropped: the web interface and its API live at the root.
    static func origin(from input: String) -> URL? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.contains("://") { text = "https://" + text }
        guard var parts = URLComponents(string: text),
              let scheme = parts.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = parts.host, !host.isEmpty
        else { return nil }
        parts.scheme = scheme
        parts.user = nil
        parts.password = nil
        parts.path = ""
        parts.query = nil
        parts.fragment = nil
        return parts.url
    }

    /// Plain HTTP is only allowed to these hosts. They are the ones App
    /// Transport Security lets through with `NSAllowsLocalNetworking`
    /// (unqualified names, `.local` names, IP addresses), narrowed to private
    /// IP ranges.
    static func isLocalNetwork(_ host: String) -> Bool {
        let host = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        if let ip = IPv4Address(host) {
            let b = [UInt8](ip.rawValue)
            return b[0] == 10 || b[0] == 127 || (b[0] == 172 && b[1] & 0xF0 == 16)
                || (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254)
        }
        if let ip = IPv6Address(host) {
            let b = [UInt8](ip.rawValue)
            return ip.isLoopback || ip.isLinkLocal || b[0] & 0xFE == 0xFC
        }
        return !host.contains(".") || host.hasSuffix(".local")
    }

    /// Asks the server for `/api/v1/instance`, which every Book Library server
    /// answers without sign-in.
    static func check(_ origin: URL) async -> ConnectProblem? {
        if origin.scheme == "http", !isLocalNetwork(origin.host() ?? "") { return .needsHTTPS }
        let request = URLRequest(
            url: origin.appending(path: "api/v1/instance"),
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: 10
        )
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  (try? JSONDecoder().decode(Instance.self, from: data)) != nil
            else { return .notBookLibrary }
            return nil
        } catch {
            return .unreachable(reason: error.localizedDescription)
        }
    }

    private struct Instance: Decodable {
        let setupRequired: Bool
        let version: String
    }
}

import SwiftUI

/// Follows docs/design/AppConnect.dc.html, without the sign-in fields: signing
/// in happens afterwards in the server's own interface.
struct ConnectView: View {
    @Bindable var shell: Shell

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 10) {
                Image("BookMark").resizable().frame(width: 24, height: 24).accessibilityHidden(true)
                Text("Book Library").font(.system(size: 18, weight: .semibold, design: .serif))
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Connect to your library")
                    .font(.system(size: 28, weight: .semibold, design: .serif))
                    .accessibilityAddTraits(.isHeader)
                Text("Enter the address of the server that hosts your library.")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.inkMuted)
            }
            .padding(.top, 12)
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Server address").font(.system(size: 13, weight: .semibold))
                    TextField("Server address", text: $shell.address, prompt: Text(verbatim: "books.example.net"))
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.go)
                        .onSubmit(connect)
                        .font(.system(size: 16))
                        .padding(.horizontal, 14)
                        .frame(height: 48)
                        .background(.white, in: .rect(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.control))
                }
                if let problem = shell.problem {
                    Text(message(for: problem))
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Color.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Button(action: connect) {
                (shell.problem == nil ? Text("Connect") : Text("Try again"))
                    .opacity(shell.isChecking ? 0 : 1)
                    .overlay { if shell.isChecking { ProgressView().tint(.white) } }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Color.accent, in: .rect(cornerRadius: 12))
            }
            .disabled(shell.isChecking || shell.address.trimmingCharacters(in: .whitespaces).isEmpty)
            .padding(.top, 4)
            Spacer()
        }
        .foregroundStyle(Color.ink)
        .padding(.horizontal, 24)
        .padding(.top, 48)
    }

    private func connect() {
        Task { await shell.connect() }
    }

    private func message(for problem: ConnectProblem) -> String {
        switch problem {
        case .invalidAddress:
            String(localized: "Enter the address of your server, for example books.example.net.")
        case .needsHTTPS:
            String(localized: "This address is outside your home network, so the connection needs HTTPS. Use an address that starts with https://.")
        case .unreachable(let reason):
            String(localized: "The server cannot be reached. Check the address and that the server is running.") + "\n" + reason
        case .notBookLibrary:
            String(localized: "The server at this address is not a Book Library server.")
        }
    }
}

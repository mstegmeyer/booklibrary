import AVFoundation

enum ScanError: String, Error {
    case denied
    case unavailable
}

/// Recognises EAN barcodes (ISBN-13 is one) with the back camera. Its preview
/// layer sits behind the transparent web view.
final class Scanner: NSObject, AVCaptureMetadataOutputObjectsDelegate {
    let previewLayer = AVCaptureVideoPreviewLayer()
    var onCode: (String) -> Void = { _ in }

    // startRunning and stopRunning block, so they run on sessionQueue.
    private nonisolated(unsafe) let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "Scanner")
    private var lastCode: String?
    private var lastSeen = Date.distantPast

    override init() {
        super.init()
        previewLayer.session = session
        previewLayer.videoGravity = .resizeAspectFill
    }

    func start() async throws(ScanError) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: break
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else { throw .denied }
        default: throw .denied
        }
        if session.inputs.isEmpty { try configure() }
        sessionQueue.async { self.session.startRunning() }
    }

    func stop() {
        sessionQueue.async { self.session.stopRunning() }
    }

    private func configure() throws(ScanError) {
        guard let camera = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: camera),
              session.canAddInput(input)
        else { throw .unavailable }
        let output = AVCaptureMetadataOutput()
        session.beginConfiguration()
        session.addInput(input)
        session.addOutput(output)
        output.metadataObjectTypes = [.ean13, .ean8]
        output.setMetadataObjectsDelegate(self, queue: .main)
        session.commitConfiguration()
    }

    nonisolated func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        let codes = metadataObjects.compactMap { ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }
        MainActor.assumeIsolated {
            for code in codes { report(code) }
        }
    }

    /// The camera sees a code many times a second: report it once while it
    /// stays in view, and again once it has been gone for 1.5 seconds.
    private func report(_ code: String) {
        let now = Date()
        if code != lastCode || now.timeIntervalSince(lastSeen) > 1.5 { onCode(code) }
        lastCode = code
        lastSeen = now
    }
}

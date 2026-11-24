# Kumiko Studio

Open `Kumiko Studio.app` on an **Intel or Apple Silicon Mac running macOS 12+**.
The app works offline and does not need Python, Node or OpenSCAD installed.

This is a local build, not Apple Developer notarized. If macOS blocks it, allow
it through **System Settings → Privacy & Security → Open Anyway**, or run
`Prepare_and_Open.command` while it is beside the app. That optional command
applies a local ad-hoc signature and clears this app's quarantine; it does not
disable Gatekeeper. You may then move the app into Applications.

1. Choose an image or use **Try demo**.
2. Enter your panel dimensions and printer bed size.
3. Choose **Modular** for a frame with colored inserts, or **Fused** for one
   connected solid per tile.
4. Export the ZIP of all required STLs, with the numbered assembly and plate maps.
5. In Modular mode, print **fit_test.stl first** and adjust clearance if needed.

Insert plates contain every required insert: print each plate once in its
listed color. Keep the layout for the numbered plate maps. Oversized frames
have butt joints that need alignment and glue. Inserts sit on a ledge and can
be glued. Filament colors are assigned in the slicer; STL does not store them.

- `source/`: all app source, offline built resources, dependency source archives,
  tests, licenses and reproducible build instructions.
- `examples/`: a working demo project and its ready-to-print export.
- `validation/`: geometry, independent STL, browser workflow and universal
  executable validation reports.

**Verification limit:** the universal executable was built and inspected on
Linux. Geometry and UI workflows were tested in Chromium and WebKit, including
a native-bridge contract stub. The native app/window/file dialogs have not been
launched on actual macOS, and no physical print-fit test has been performed.

See `source/README.md` for the full guide and exact reference-project provenance.

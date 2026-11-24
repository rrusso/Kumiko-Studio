# Kumiko Studio

An offline macOS app that converts an image into a complete set of printable
Kumiko-style STL parts. The app executable contains **arm64 and x86_64** slices.
It uses the system AppKit and WebKit frameworks and an embedded geometry kernel;
the end user does not need Python, Node, OpenSCAD, a browser install or a server.

## Run

Requires **macOS 12 Monterey or newer**, on Intel or Apple Silicon.

1. Unzip the distribution and move `Kumiko Studio.app` into Applications.
2. Open it. This distribution is a local build, not Apple Developer signed or
   notarized. If macOS blocks it, use System Settings → Privacy & Security →
   **Open Anyway**. Only allow the app after checking that this is your expected
   download. An optional `Prepare_and_Open.command` beside the app can apply a
   local ad-hoc signature and remove quarantine from this app only, then open it.
3. Choose an image, or drop a PNG/JPEG onto the image card. The native picker also
   uses macOS image decoders for formats such as HEIC and TIFF.
4. Set the panel dimensions, triangle edge length and your actual printer bed.
5. Choose Modular or Fused. Wait for generation, then click **Export all STLs**.
6. Print the fit test first in Modular mode and read `PRINT_AND_ASSEMBLY.txt`
   inside the generated ZIP.

The optional first-launch command is readable shell source. It changes only
the bundled app's local signature/quarantine; it does not disable Gatekeeper
or change system security settings. `codesign` and `xattr` are macOS tools.

## Print modes

**Modular** generates a lattice frame with an integrated support ledge and
separate triangular motif inserts. Inserts have a perimeter ring so every
insert is one connected printable part. Their top surface is flush with the
frame. They drop onto the ledge from the front and can be glued. The default
clearance is 0.2 mm **per side**, not a total diameter/width adjustment. The fit
coupon is printed at the selected dimensions and tolerances; actual printer
calibration still determines the fit. If a full-size, side-by-side coupon will
not fit the bed, the app reports this and asks you to test a frame tile and an
insert instead.

**Fused** generates one unioned, connected lattice object per printer-bed tile.
The pattern and grid are combined with real geometric unions, not overlapping
unwelded boxes. Split fused tiles have narrow seam rails so motifs cut by the
tile boundary cannot become loose fragments. Print in one filament.

Both modes automatically divide oversized panels into equal, bed-sized tiles,
reserving a configurable margin on every side. These are **butt joints**: glue
the tiles after alignment on a flat surface. Split modular tiles have narrow
seam rails at the support-ledge layer to keep each frame tile connected. This app does not generate
traditional individually notched wooden Kumiko strips or snap-lock joinery.

## What is in an exported ZIP?

| File | Purpose |
| --- | --- |
| `frame/Rxx_Cxx.stl` | Modular lattice tiles, each printed once |
| `panels/Rxx_Cxx.stl` | Fused tiles, each printed once |
| `inserts/plate_NNN_color_N_HEX.stl` | All required inserts, packed by filament; print each plate once |
| `fit_test.stl` | Separate test frame and ring, printed side by side |
| `backing/Rxx_Cxx.stl` | Optional separate solid back plates |
| `assembly.svg` | Numbered cell and tile map |
| `maps/plate_NNN.svg` | IDs in the exact insert print layout |
| `manifest.json` | Parameters, palette, part bounds/volumes and cell placements |
| `PRINT_AND_ASSEMBLY.txt` | Exact print quantities, filament assignments and assembly guide |

STL coordinates are in **millimetres**, at 100% scale. Each print part starts at
nonnegative XY coordinates with its bed surface at Z=0. Multiple disconnected
objects in an insert plate are intentional: there is one closed component per
insert. Maps use R01 at the top and C01 on the left. Slicer auto-arranging or
rotating inserts changes the plate map; keep the exported layout or track IDs
yourself. Labels appear in the maps, not embossed into the small parts.

STL cannot store filament color. File names and the manifest specify suggested
colors; assign them in the slicer. The mass estimate uses fully dense PLA at
1.24 g/cm³ and excludes the fit coupon. Supports, brims and slicer settings can
change actual filament use. No printer/slicer profiles are silently applied.

## Image and pattern controls

- Native image import, or drag-and-drop for browser-supported images.
- Center crop or fit the entire image, preserving image aspect ratio.
- Tone mapping: dark image regions receive denser motifs; contrast, gamma and
  brightness adjust the mapping. White/highlight regions can remain empty.
- Texture mapping: local grayscale variation, entropy and image gradients choose
  motifs. This is an independent browser implementation of the reference idea,
  not a pixel-identical reproduction of scikit-image features.
- Constant motif with image-derived colors, for a consistent pattern.
- Up to eight deterministically extracted filament colors. Flat input images
  may produce fewer unique colors than the selected upper limit.
- Seven cell states: Empty, Tsumi, Asanoha, Shippo, Sakura, Ryuso and Kagome.
  These are Kumiko-inspired geometric interpretations, including curved motifs.
- Horizontal or vertical equilateral triangle rows (six triangles form a hexagon).
- Omit white/black backgrounds with an adjustable tolerance. Fully transparent
  cells are always left empty, while the supporting lattice is retained.
- In **Cell map**, click a cell to override its motif and filament.
- Save/open a project JSON including the normalized source image, settings and
  cell edits. Changing panel size, border, grid orientation or cell size clears
  cell edits because cell IDs would move. Choosing a new image also clears edits.
- A maximum of 2,600 visible cells keeps the app responsive; use larger triangles
  for larger panels. Images are normalized to at most 2,048 px for projects and
  sampled at at most 1,024 px on the longer side.

Small cells clipped at the outer border are omitted when they cannot hold a
reliable insert. The app reports the count. Source image sharpness and limited
filament palettes determine how much image detail survives the transformation.

## Source layout

| Path | Contents |
| --- | --- |
| `native/host.c` | Native AppKit/WebKit window, menus, image picker, project picker and save dialogs |
| `web/engine.mjs` | Image sampling, pattern generation, lattice, ledges, bed tiling and plate packing |
| `web/export.mjs` | Binary STL, assembly/plate SVG maps, manifest, print guide and ZIP writer |
| `web/worker.mjs` | Geometry worker with an embedded Manifold WASM module |
| `web/app.mjs`, `web/index.html`, `web/style.css` | Complete app interface and 3D viewer |
| `dist/` | Built offline resources, so native rebuilds do not require Node |
| `scripts/build-mac.py` | Builds both architectures and combines them into one universal executable |
| `scripts/build-web.mjs` | Bundles the viewer, worker and geometry kernel with no runtime downloads |
| `scripts/make-icon.py` | Reproducible native app icon |
| `tests/` | Geometry, export, assembly interference, UI and independent STL checks |
| `vendor/` | Exact dependency distributions/source archives and licenses |

## Build on a Mac

For a **native-only rebuild** using the included offline web resources, install
Xcode Command Line Tools and Python 3, then run from `source`:

```sh
python3 scripts/build-mac.py
```

The result appears beside `source`, as `Kumiko Studio.app`. The build script
compiles `-arch arm64` and `-arch x86_64`, combines them into a fat Mach-O and
applies/verifies a local ad-hoc signature. It does not notarize the application.

After editing web source, use Node 20 or later and rebuild the resources first:

```sh
npm ci
npm run build
python3 scripts/build-mac.py
```

For cross-compilation on Linux, use Zig's C compiler:

```sh
python3 scripts/build-mac.py --zig /absolute/path/to/zig
```

The host dynamically resolves Objective-C runtime symbols and system framework
classes; an Apple SDK is not redistributed. The distribution's compiled host
was produced with Zig 0.17.0, with macOS 12 as its deployment target. The source
also builds with Xcode clang. There are no embedded Node/Electron executables.

Dependency versions are pinned in `package-lock.json`. The supplied dependency
archives contain Three.js JavaScript source and the Manifold JavaScript/WASM
distribution; the Manifold C++ source snapshot is also included. See
`THIRD_PARTY_NOTICES.md` for licenses, upstream source locations and commits.

## Verification

```sh
npm test
npx playwright install chromium webkit
npm run test:ui
python3 -m pip install trimesh numpy
python3 tests/validate_stls.py
```

Tests cover all motif states, both grid orientations, multi-tile beds,
monolithic and modular output, backing, transparency, background filtering and
manual edits. They check every edge has exactly two incident faces, consistent
outward winding, nonzero triangle areas, signed volume and actual bed bounds.
Re-imported assembled meshes are checked for frame/insert interference and
ledge contact. Independent trimesh checks read the actual binary STLs out of
the exported ZIPs. UI tests exercise offline file loading and the bridge message
contract, cell edits, project save/load and ZIP generation.

**Test limitation:** the native `.app` has not been launched on actual macOS in
this build environment. Native architecture/deployment metadata are checked,
and the UI/geometry are exercised separately. The native file-dialog bridge's
Objective-C calls and actual printer fit still require testing on a Mac/printer.
The included validation reports distinguish those checks clearly.

## Reference projects

- [juliusang/kumiko-pattern-generator](https://github.com/juliusang/kumiko-pattern-generator),
  examined at commit `823853e2a47fcdc6e0f46cdb397da4adb57388e5`.
  The app follows its line-network → 2D union → Manifold extrusion approach and
  its parametric printable-panel controls. This implementation uses Manifold's
  built-in CrossSection operations instead of a separately bundled Clipper library.
- [hampusudd/kumiko_generator](https://github.com/hampusudd/kumiko_generator),
  examined at commit `4112cd4b437744faa132bc8851264225472250cf`.
  The app follows its image sampling, triangle/hexagon grid, feature-based motif
  selection and prominent-color approach, with a standalone JavaScript engine.

The app source is an independent implementation, supplied under MIT. Upstream
reference source files are not redistributed as if they were our own. The
original projects' release interfaces and Python environment are not needed to
run the app.

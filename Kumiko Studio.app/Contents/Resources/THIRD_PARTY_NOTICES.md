# Third-party notices and provenance

The original Kumiko Studio host, user interface, conversion/assembly logic,
STL/SVG/ZIP export code and build/test scripts are MIT-licensed. See `LICENSE`.

## Manifold 3.5.4

- Source: https://github.com/elalish/manifold
- Snapshot: tag `v3.5.4`, commit `ce50d78021d64507f89e8c9fc2c2e51018117857`.
- JavaScript/WASM package: `manifold-3d` 3.5.4.
- License: Apache-2.0. Full license included as `vendor/manifold-LICENSE` and
  inside the source snapshot. The source tree retains upstream authorship and
  notices, including bundled geometry components where applicable.
- Runtime code is bundled locally. The WASM bytes are embedded in the geometry
  worker; no CDN or network fetch is required.

## Three.js 0.186.1

- Source: https://github.com/mrdoob/three.js
- Package: `three` 0.186.1, including OrbitControls.
- License: MIT, reproduced in `vendor/three-LICENSE` and the package archive.
- The archive includes the upstream JavaScript source files.

## esbuild 0.28.2 (build only)

- Source: https://github.com/evanw/esbuild
- License: MIT, reproduced in `vendor/esbuild-LICENSE`.
- esbuild is not a required end-user runtime. Its platform binary is installed
  by `npm ci` when web assets are rebuilt. The npm distribution and a source
  snapshot are provided for inspection.

## Playwright 1.51.1 (test only)

- Source: https://github.com/microsoft/playwright
- License: Apache-2.0; reproduced in `vendor/playwright-LICENSE`.
- Tests use Playwright; it is not included in the running app. Browser builds
  are separate development/test dependencies, not part of the app distribution.

## Design references

The following repositories were inspected to satisfy the requested design
basis. Their files are not vendored or relicensed here:

1. https://github.com/juliusang/kumiko-pattern-generator
   commit `823853e2a47fcdc6e0f46cdb397da4adb57388e5`.
   Inspected README and single-file generator: parametric panels, centerline
   strokes, boolean contour union, watertight extrusion and binary STL.
   No standalone license file was present in the inspected tree.
2. https://github.com/hampusudd/kumiko_generator
   commit `4112cd4b437744faa132bc8851264225472250cf`.
   Inspected image sampler, grid, classifier and pattern primitives: triangular
   image sampling, prominent-color extraction and feature-to-pattern mapping.
   The README states "MIT (or your preferred license)"; no separate license file
   was present in the inspected tree. The app provides independently written
   equivalents of those concepts rather than redistributing the Python tree.

Kumiko motif names describe geometric interpretations and do not imply exact
traditional joinery or endorsement by either reference project's author.

#!/usr/bin/env python3
"""Build a genuine arm64 + x86_64 macOS .app, without third-party runtime.

On a Mac, Xcode Command Line Tools + Python 3 are sufficient. No Node is
required when reusing the provided source/dist web resources. To edit the
web app, run npm ci && npm run build first. On Linux, pass --zig /path/to/zig.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import plistlib
import shutil
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def universal(inputs, output):
    slices = [Path(p).read_bytes() for p in inputs]
    offset = 16384
    records = []
    for data in slices:
        magic, cpu, subtype = struct.unpack_from('<III', data)
        if magic != 0xfeedfacf:
            raise ValueError('Expected a 64-bit Mach-O slice')
        records.append((cpu, subtype, offset, len(data), 14))
        offset = (offset + len(data) + 16383) & ~16383
    result = bytearray(offset)
    struct.pack_into('>II', result, 0, 0xcafebabe, len(slices))
    for i, (record, data) in enumerate(zip(records, slices)):
        struct.pack_into('>IIIII', result, 8 + i * 20, *record)
        result[record[2]:record[2]+len(data)] = data
    output.write_bytes(result)
    output.chmod(0o755)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--zig',type=Path)
    parser.add_argument('--output',type=Path,default=ROOT.parent/'Kumiko Studio.app')
    args=parser.parse_args()
    if not (ROOT/'dist/app.bundle.js').is_file():
        raise SystemExit('Missing web resources. Run npm ci && npm run build.')
    build=ROOT/'native/build'
    build.mkdir(exist_ok=True)
    paths=[]
    for arch,target in [('arm64','aarch64-macos.12.0.0'),('x86_64','x86_64-macos.12.0.0')]:
        out=build/f'KumikoStudio-{arch}'
        if args.zig:
            command=[str(args.zig.resolve()),'cc','-target',target,'-mmacosx-version-min=12.0','-O2','-Wall','-Wextra',str(ROOT/'native/host.c'),'-o',str(out)]
        elif platform.system()=='Darwin':
            command=['xcrun','clang','-arch',arch,'-mmacosx-version-min=12.0','-O2','-Wall','-Wextra',str(ROOT/'native/host.c'),'-o',str(out)]
        else:
            raise SystemExit('On non-Mac hosts, supply --zig /path/to/zig.')
        subprocess.run(command,check=True)
        paths.append(out)
    app=args.output.resolve()
    if app.exists():shutil.rmtree(app)
    macos=app/'Contents/MacOS';resources=app/'Contents/Resources'
    macos.mkdir(parents=True);resources.mkdir()
    exe=macos/'KumikoStudio';universal(paths,exe)
    shutil.copytree(ROOT/'dist',resources/'web')
    if (ROOT/'native/AppIcon.icns').is_file():shutil.copy2(ROOT/'native/AppIcon.icns',resources/'AppIcon.icns')
    for name in ['README.md','THIRD_PARTY_NOTICES.md']:
        if (ROOT/name).is_file():shutil.copy2(ROOT/name,resources/name)
    info={
      'CFBundleName':'Kumiko Studio','CFBundleDisplayName':'Kumiko Studio',
      'CFBundleIdentifier':'local.kumikostudio.mac','CFBundleExecutable':'KumikoStudio',
      'CFBundlePackageType':'APPL','CFBundleShortVersionString':'1.0.0','CFBundleVersion':'1',
      'CFBundleIconFile':'AppIcon','LSMinimumSystemVersion':'12.0',
      'NSHighResolutionCapable':True,'NSPrincipalClass':'NSApplication',
      'NSHumanReadableCopyright':'Copyright © 2026. MIT license.',
      'CFBundleSupportedPlatforms':['MacOSX'],
      'CFBundleDocumentTypes':[{'CFBundleTypeName':'Kumiko Studio Project','CFBundleTypeRole':'Editor','CFBundleTypeExtensions':['kumiko'],'LSHandlerRank':'Owner'}]
    }
    with (app/'Contents/Info.plist').open('wb') as f:plistlib.dump(info,f)
    (app/'Contents/PkgInfo').write_bytes(b'APPL????')
    signed=False
    if platform.system()=='Darwin':
        subprocess.run(['codesign','--force','--deep','--sign','-',str(app)],check=True)
        subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
        signed=True
    record={'app':'Kumiko Studio','architectures':['arm64','x86_64'],'minimumMacOS':'12.0','nativeRuntime':'system AppKit and WebKit','externalRuntimeRequired':False,'appleDeveloperNotarized':False,'bundleAdHocSignedOnMac':signed,'executableSHA256':hashlib.sha256(exe.read_bytes()).hexdigest()}
    (ROOT.parent/'BUILD_REPORT.json').write_text(json.dumps(record,indent=2)+'\n')
    print(app)

if __name__=='__main__':main()

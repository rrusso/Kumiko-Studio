#!/usr/bin/env python3
"""Read actual universal Mach-O headers and validate packaged offline resources."""
import hashlib
import json
from pathlib import Path
import plistlib
import struct

ROOT=Path(__file__).resolve().parents[1]
app=ROOT.parent/'Kumiko Studio.app'
with (app/'Contents/Info.plist').open('rb') as f:info=plistlib.load(f)
exe=app/'Contents/MacOS'/info['CFBundleExecutable']
data=exe.read_bytes();magic,n=struct.unpack_from('>II',data);assert magic==0xcafebabe and n==2
architectures=[]
for i in range(n):
    cpu,subtype,offset,size,align=struct.unpack_from('>IIIII',data,8+i*20)
    blob=data[offset:offset+size]
    arch={0x100000c:'arm64',0x1000007:'x86_64'}[cpu]
    m,innercpu,innersub,filetype,ncmds,sizeofcmds,flags,reserved=struct.unpack_from('<IIIIIIII',blob)
    assert m==0xfeedfacf and innercpu==cpu and filetype==2
    assert offset%(1<<align)==0 and len(blob)==size
    position=32;minimum=None;loads=[];signature=False;entry=False
    for j in range(ncmds):
        cmd,cmdsize=struct.unpack_from('<II',blob,position);assert cmdsize>=8
        if cmd==0x32:
            platform,version,sdk,ntools=struct.unpack_from('<IIII',blob,position+8)
            assert platform==1;minimum=f'{version>>16}.{version>>8&255}.{version&255}'
        elif cmd==0x24:
            version,sdk=struct.unpack_from('<II',blob,position+8);minimum=f'{version>>16}.{version>>8&255}.{version&255}'
        elif cmd==0xc:
            start=struct.unpack_from('<I',blob,position+8)[0]
            name=blob[position+start:position+cmdsize].split(b'\0')[0].decode();loads.append(name)
            assert name.startswith('/usr/lib/'),'Unexpected non-system linked runtime'
        elif cmd==0x1d:signature=True
        elif cmd==0x80000028:entry=True
        position+=cmdsize
    assert minimum=='12.0.0' and entry
    architectures.append({'architecture':arch,'minimumMacOS':minimum,'bytes':size,'systemDylibs':loads,'embeddedExecutableSignature':signature})
assert {a['architecture'] for a in architectures}=={'arm64','x86_64'}
assert exe.stat().st_mode&0o111
for filename in ['index.html','style.css','app.bundle.js','BUILD_INFO.json']:
    packaged=app/'Contents/Resources/web'/filename
    assert packaged.read_bytes()==(ROOT/'dist'/filename).read_bytes(),filename+' exact resource match'
assert (app/'Contents/Resources/AppIcon.icns').is_file()
result={'passed':True,'architectures':architectures,'executableSHA256':hashlib.sha256(data).hexdigest(),'macOSNativeLaunchTested':False,'notarized':False,'offlineResourcesMatchSourceBuild':True}
(ROOT/'test-results/bundle-report.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))

#!/usr/bin/env python3
"""Bundle the app, complete application source, examples and verification.

Run after building and testing. Development dependencies, temporary test
exports, browser screenshots and intermediate architecture binaries are
excluded; dependency source archives and the offline dist are retained.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import tarfile
import zipfile

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT.parent

def included(path):
    rel=path.relative_to(DIST)
    if any(p in {'node_modules','test-results','__pycache__','.git','.DS_Store'} for p in rel.parts):return False
    if rel.parts[:3]==('source','native','build'):return False
    if len(rel.parts)==2 and rel.parts[0]=='source' and path.suffix=='.tgz':return False
    if len(rel.parts)==3 and rel.parts[:2]==('source','native') and path.name.startswith('host-'):return False
    return path.is_file()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=DIST.parent/'Kumiko_Studio_Universal_Mac_App_and_Source.zip');args=parser.parse_args()
    if not (DIST/'Kumiko Studio.app/Contents/MacOS/KumikoStudio').is_file():raise SystemExit('Build the app first.')
    (DIST/'Prepare_and_Open.command').chmod(0o755)
    validate=DIST/'validation';validate.mkdir(exist_ok=True)
    for name in ['geometry-report.json','ui-report.json','independent-stl-report.json','bundle-report.json']:
        src=ROOT/'test-results'/name
        if not src.is_file():raise SystemExit('Missing validation report: '+name)
        shutil.copy2(src,validate/name)
    # Source archives and example print sets must also be complete; an intact
    # outer ZIP is insufficient when a nested archive was interrupted.
    for archive in sorted((ROOT/'vendor').iterdir()):
        if archive.name.endswith(('.tgz','.tar.gz')):
            with gzip.open(archive,'rb') as f:
                while f.read(1024*1024):pass
            with tarfile.open(archive,'r:gz') as t:t.getmembers()
    for archive in sorted((DIST/'examples').glob('*.zip')):
        with zipfile.ZipFile(archive) as z:assert z.testzip() is None
    checksum=DIST/'SHA256SUMS.json'
    files=sorted(p for p in DIST.rglob('*') if included(p) and p!=checksum)
    sums={str(p.relative_to(DIST)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    checksum.write_text(json.dumps(sums,indent=2)+'\n')
    files.append(checksum)
    # Write and verify a fully closed staging archive before publishing its
    # final path. ZIP64 is unnecessary for this distribution; explicit directory
    # entries and ordinary Deflate entries work with macOS Archive Utility.
    stage=args.output.with_name(args.output.name+'.partial')
    directories={Path('KumikoStudio')}
    for p in files:
        parent=Path('KumikoStudio')/p.relative_to(DIST).parent
        while str(parent)!='.':
            directories.add(parent);parent=parent.parent
    with zipfile.ZipFile(stage,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=False) as z:
        for directory in sorted(directories):
            entry=zipfile.ZipInfo(directory.as_posix()+'/')
            entry.create_system=3;entry.external_attr=(stat.S_IFDIR|0o755)<<16|0x10
            z.writestr(entry,b'')
        for p in files:
            name=(Path('KumikoStudio')/p.relative_to(DIST)).as_posix()
            entry=zipfile.ZipInfo(name)
            entry.create_system=3;entry.compress_type=zipfile.ZIP_DEFLATED
            permissions=0o755 if '/Contents/MacOS/' in name or name.endswith('.command') else 0o644
            entry.external_attr=(stat.S_IFREG|permissions)<<16
            z.writestr(entry,p.read_bytes(),compresslevel=6)
    with stage.open('rb') as f:os.fsync(f.fileno())
    with zipfile.ZipFile(stage) as z:
        assert z.testzip() is None
        executable=z.getinfo('KumikoStudio/Kumiko Studio.app/Contents/MacOS/KumikoStudio')
        assert executable.external_attr>>16 & 0o111,'Executable permission missing'
        command=z.getinfo('KumikoStudio/Prepare_and_Open.command');assert command.external_attr>>16&0o111
        for name,digest in sums.items():assert hashlib.sha256(z.read('KumikoStudio/'+name)).hexdigest()==digest
        assert not any('/node_modules/' in name or name.endswith('-ui.png') for name in z.namelist())
    os.replace(stage,args.output)
    print(json.dumps({'zip':str(args.output.resolve()),'files':len(files),'bytes':args.output.stat().st_size,'crcAndSourceHashesVerified':True,'executablePermissionsPreserved':True},indent=2))

if __name__=='__main__':main()

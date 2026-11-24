#!/usr/bin/env python3
"""Independent STL verification with trimesh (pip install trimesh numpy).

Run after npm test / npm run test:ui. This reads the actual exported ZIPs,
checks CRCs, then checks orientation, watertightness, volume and bed bounds.
"""
import io
import json
from pathlib import Path
import zipfile
import numpy as np
import trimesh

ROOT=Path(__file__).resolve().parents[1]
rows=[]
archives=list((ROOT/'test-results').glob('*.zip'))+list((ROOT.parent/'examples').glob('*_print_set.zip'))
for archive in sorted(archives):
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None,archive.name+' CRC'
        manifest=json.loads(z.read('manifest.json'))
        bed=manifest['config'];maxxy=[bed['bedWidth']-2*bed['margin'],bed['bedHeight']-2*bed['margin']]
        count=0
        for part in manifest['parts']:
            mesh=trimesh.load(io.BytesIO(z.read(part['filename'])),file_type='stl',force='mesh',process=True)
            assert mesh.is_watertight,(archive.name,part['filename'],'watertight')
            assert mesh.is_winding_consistent,(archive.name,part['filename'],'winding')
            assert mesh.volume>0,(archive.name,part['filename'],'volume')
            assert np.all(mesh.area_faces>0),(archive.name,part['filename'],'zero-area faces')
            assert np.all(mesh.bounds[0]>=-0.0001),(archive.name,part['filename'],'origin')
            assert np.all(mesh.bounds[1,:2]<=np.array(maxxy)+0.001),(archive.name,part['filename'],'bed')
            assert abs(mesh.volume-part['volumeMm3'])<max(.02,part['volumeMm3']*1e-5),(archive.name,part['filename'],'volume agreement')
            count+=1
        rows.append({'archive':archive.name,'stls':count,'passed':True})
        print('PASS independent',archive.name,count,'STLs')
(ROOT/'test-results/independent-stl-report.json').write_text(json.dumps({'passed':True,'archives':rows,'totalSTLs':sum(r['stls'] for r in rows)},indent=2)+'\n')

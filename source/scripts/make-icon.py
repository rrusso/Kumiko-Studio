#!/usr/bin/env python3
"""Draw the code-native lattice icon. Optional build dependency: Pillow."""
import io
import math
from pathlib import Path
import struct
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
im=Image.new('RGBA',(1024,1024),(0,0,0,0))
d=ImageDraw.Draw(im)
d.rounded_rectangle((45,45,979,979),radius=210,fill='#f3eee1')
d.rounded_rectangle((126,126,898,898),radius=140,fill='#19695e')
vertices=[(512+330*math.cos(math.radians(60*i-30)),512+330*math.sin(math.radians(60*i-30))) for i in range(6)]
d.line(vertices+[vertices[0]],fill='#e7cda2',width=30,joint='curve')
for i,a in enumerate(vertices):
    b=vertices[(i+1)%6];o=((a[0]+b[0]+512)/3,(a[1]+b[1]+512)/3)
    d.line([a,(512,512)],fill='#e7cda2',width=23)
    for p in [a,b,(512,512)]:d.line([p,o],fill='#f3eee1',width=18)
chunks=[]
for size,code in [(16,b'icp4'),(32,b'icp5'),(64,b'icp6'),(128,b'ic07'),(256,b'ic08'),(512,b'ic09'),(1024,b'ic10')]:
    buf=io.BytesIO();im.resize((size,size),Image.Resampling.LANCZOS).save(buf,format='PNG');data=buf.getvalue();chunks.append(code+struct.pack('>I',len(data)+8)+data)
blob=b''.join(chunks)
(root/'native/AppIcon.icns').write_bytes(b'icns'+struct.pack('>I',len(blob)+8)+blob)
print(root/'native/AppIcon.icns')

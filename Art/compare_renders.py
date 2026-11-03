"""Compare aligned, unmodified Blender and browser captures on foreground pixels.

SSIM is an engineering check, not a claim that aesthetic fidelity has an objective
percentage. Excludes empty background; includes materials, shadows and silhouettes.
"""
from pathlib import Path
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter, binary_erosion

ROOT=Path(__file__).resolve().parent/'renders'
version=sys.argv[sys.argv.index('--version')+1] if '--version' in sys.argv else '1'
card=sys.argv[sys.argv.index('--cards')+1] if '--cards' in sys.argv else ''
suffix='-cards-'+card if card else '-seated' if '--seated' in sys.argv else '-back' if '--back' in sys.argv else ''
a=np.asarray(Image.open(ROOT/('blender-reference-v'+version+suffix+'.png')).convert('RGBA'),dtype=np.float64)/255
b=np.asarray(Image.open(ROOT/('web-reference-v'+version+suffix+'.png')).convert('RGBA'),dtype=np.float64)/255
assert a.shape==b.shape, (a.shape,b.shape)
mask=(a[:,:,3]>.98)&(b[:,:,3]>.98)
inner=binary_erosion(mask,iterations=5)
rgb_a=a[:,:,:3];rgb_b=b[:,:,:3]
scores=[]
for c in range(3):
    x=rgb_a[:,:,c];y=rgb_b[:,:,c]
    ux=gaussian_filter(x,1.5);uy=gaussian_filter(y,1.5)
    vx=gaussian_filter(x*x,1.5)-ux*ux;vy=gaussian_filter(y*y,1.5)-uy*uy
    cov=gaussian_filter(x*y,1.5)-ux*uy
    ssim=((2*ux*uy+.01**2)*(2*cov+.03**2))/((ux*ux+uy*uy+.01**2)*(vx+vy+.03**2))
    scores.append(float(ssim[inner].mean()))
union=(a[:,:,3]>.5)|(b[:,:,3]>.5)
intersection=(a[:,:,3]>.5)&(b[:,:,3]>.5)
report={'foreground_ssim_rgb':scores,'foreground_ssim_mean':sum(scores)/3,
        'foreground_mae_8bit':float(np.abs(rgb_a-rgb_b)[mask].mean()*255),
        'silhouette_iou':float(intersection.sum()/union.sum()),'foreground_pixels':int(mask.sum()),
        'method':'Aligned 1200x1000 captures, RGB SSIM sigma 1.5, exclude transparent background and 5px silhouette boundary. No image alignment, recoloring or postprocessing before measurement.',
        'target':.90,'note':'SSIM >= 0.90 is a reproducible technical gate; visual acceptance remains separate.'}
(ROOT/('comparison-v'+version+suffix+'.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
# Presentation only: identical flat background and scale; originals are preserved.
board=Image.new('RGB',(1800,850),'#263744');draw=ImageDraw.Draw(board)
try:
    font=ImageFont.truetype('arial.ttf',28)
except OSError:
    try:font=ImageFont.truetype('DejaVuSans.ttf',28)
    except OSError:font=ImageFont.load_default(size=28)
for i,(file,title) in enumerate([('blender-reference-v'+version+suffix+'.png','BLENDER / CYCLES'),('web-reference-v'+version+suffix+'.png','WEB / REALTIME')]):
    img=Image.open(ROOT/file).convert('RGBA');img.thumbnail((890,742),Image.Resampling.LANCZOS)
    board.paste(img,(i*900+5,70),img);draw.text((i*900+28,22),title,font=font,fill='#eee5d2')
draw.text((28,810),f"Foreground SSIM: {report['foreground_ssim_mean']:.3f}   |   Silhouette IoU: {report['silhouette_iou']:.3f}",font=font,fill='#c0d2ce')
board.save(ROOT/('blender-web-comparison-v'+version+suffix+'.jpg'),quality=94)
print(json.dumps(report,indent=2))
if report['foreground_ssim_mean'] < report['target']:
    raise SystemExit('Reference fidelity gate failed: foreground SSIM below 0.90')

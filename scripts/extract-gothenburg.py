"""Read-only extraction of AR simulations. Runtime has no dependency on Unity."""
import json, hashlib
from pathlib import Path

SOURCE = Path(r'E:\Work\Projects\Unity\ARBuildingVuforia\Assets\OriginData\01_Simulation_GTB')
ROOT = Path(__file__).resolve().parents[1]
rows = []
digest = hashlib.sha256()
for mask in range(256):
    bits = [(mask >> (7-i)) & 1 for i in range(8)]
    names = ['WWR', 'WD', 'GLZ', 'EW', 'R', 'Gnd', 'VR', 'HR']
    key = 'ORI0_NoF0_' + '_'.join(f'{n}{v}' for n,v in zip(names,bits))
    folder = SOURCE / key
    energy_bytes = (folder/'energy.json').read_bytes()
    day_bytes = (folder/'daylight_DA.json').read_bytes()
    digest.update(key.encode()); digest.update(energy_bytes); digest.update(day_bytes)
    energy = json.loads(energy_bytes)['outputs']
    rooms = json.loads(day_bytes)['outputs']['DA']
    room_sda = [100*sum(v>=50 for v in room)/len(room) for room in rooms]
    points = [v for room in rooms for v in room]
    rows.append({'key':key, 'E':round(sum(sum(energy[k]) for k in ['heating','cooling','hot_water','equip','lighting']),4),
                 'D':round(100*sum(v>=50 for v in points)/len(points),4),
                 'rooms':[round(v,2) for v in room_sda]})
data = {'city':'Gothenburg','orientation':'S','floors':2,'sourceSha256':digest.hexdigest(),
        'aggregation':'sDA: equal-weight sensor fraction with DA >= 50; E: sum of 12 monthly heating, cooling, hot_water, equip, lighting values.',
        'scope':'256 source scenarios, fixed ORI0 / NoF0. HR30 is interpolated at runtime. Costs are game points, not sourced construction prices.',
        'rows':rows}
(ROOT/'src/gothenburg.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'count':len(rows),'E':[min(r['E'] for r in rows),max(r['E'] for r in rows)],'D':[min(r['D'] for r in rows),max(r['D'] for r in rows)],'sha256':digest.hexdigest()}))

"""Visual audit of the declared teaching response surface; no new simulation."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

root=Path(__file__).resolve().parents[1]
fit=json.loads((root/'src/response-fit.json').read_text(encoding='utf-8-sig'))
factors=['WWR','Window depth','Glass A–B','Wall U','Roof U','Ground U','Ventilation','Heat recovery']
x=np.linspace(0,1,101)
def predict(c,k):
    p=fit['shapes'][k]
    z=[2*(1-(1-v)**(-power) if power<0 else v**power)-1 for v,power in zip(c,p)]
    return sum(t['coefficient']*np.prod([z[i] for i in t['axes']]) for t in fit['models'][k])
for metric,color,unit in [('D','#1778a8','sDA (%)'),('E','#b9632d','Energy (kWh/m²/year)')]:
    fig,axes=plt.subplots(2,4,figsize=(14,6.8),layout='constrained')
    for i,ax in enumerate(axes.flat):
        for baseline,alpha,style in [(.25,.45,'--'),(.5,1,'-'),(.75,.45,':')]:
            vals=[]
            for v in x:
                c=[baseline]*8;c[i]=v;vals.append(predict(c,metric))
            ax.plot(x,vals,color=color,alpha=alpha,linestyle=style,label='Others = '+str(baseline))
        ax.set_title(factors[i],fontsize=11);ax.set_xlabel('Normalized parameter');ax.set_ylabel(unit);ax.grid(alpha=.2);ax.set_xlim(0,1)
    axes[0,0].legend(fontsize=8)
    fig.suptitle(('Daylight' if metric=='D' else 'Energy')+' response — other parameters held fixed',fontsize=15)
    fig.supxlabel('Endpoint trends fitted to 256 Gothenburg scenarios. Interior curvature is a teaching assumption, not a newly simulated result.',fontsize=9)
    fig.savefig(root/('validation/points-response-'+metric+'.png'),dpi=160);plt.close(fig)
print('Saved D/E response curve audits.')

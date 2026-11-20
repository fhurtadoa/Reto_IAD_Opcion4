"""Independent exact reference for manually entered OptiCompromise cases."""
from fractions import Fraction as Q
import csv
import json
import math
from pathlib import Path
import sys
from zipfile import ZipFile
import xml.etree.ElementTree as ET


def mixed_intervals():
    for b in (0, 1):
        for x in range(4 * b + 1):
            yield x, b, Q(1), Q(9 - x)


def mixed_objectives(x, b, y):
    return (3*x+2*y+b, x+2*y+4*b, y-b)


def mixed_reference():
    intervals = list(mixed_intervals())
    f = mixed_objectives
    extremes = [f(x,b,y) for x,b,lo,hi in intervals for y in (lo,hi)]
    signs = (1, -1, 1)
    rows = [max(extremes,key=lambda z:s*z[i]) for i,s in enumerate(signs)]
    ideal = [z[i] for i,z in enumerate(rows)]
    nadir = [min((z[i] for z in rows),key=lambda v:s*v) for i,s in enumerate(signs)]
    weights = (Q(1,2), Q(3,10), Q(1,5))
    def affine(x,b,y):
        return tuple(w*s*(upper-z)/abs(upper-lower)
                     for w,s,upper,lower,z in zip(weights,signs,ideal,nadir,f(x,b,y)))
    scores = {m: [] for m in ("L1","L2","L_inf")}
    for x,b,lo,hi in intervals:
        c = affine(x,b,0)
        m = tuple(v-u for u,v in zip(c,affine(x,b,1)))
        # The minimum of a convex quadratic occurs at stationarity or an endpoint.
        station = -sum(a*s for a,s in zip(c,m))/sum(s*s for s in m)
        # The upper envelope can attain its minimum at a boundary or an intersection.
        intersections = [(c[j]-c[i])/(m[i]-m[j]) for i in range(3)
                         for j in range(i+1,3) if m[i]!=m[j]]
        for metric, ys in (("L1", [lo,hi]), ("L2",[lo,hi,station]), ("L_inf",[lo,hi,*intersections])):
            for y in ys:
                if lo <= y <= hi:
                    d=affine(x,b,y)
                    value = sum(d) if metric=="L1" else sum(t*t for t in d) if metric=="L2" else max(d)
                    scores[metric].append((value, (x,y,b), f(x,b,y)))
    results={key:min(vals) for key,vals in scores.items()}
    return tuple(ideal),tuple(nadir),results


def references(case, weights):
    w = tuple(Q(str(round(v,12))) for v in weights)
    if case =='H':
        return mixed_reference()
    if case in ('D','E','O'):
        # The independent objective totals lie on the same simplex boundary.
        total = 12 if case=='O' else 10
        p=w[0]**2/(w[0]**2+w[1]**2)
        def result(x):
            return x,total-x
        x = {"L1": total if w[0]>=w[1] else 0, "L2":total*p, "L_inf":total*w[0]}
        points = {m:result(v) for m,v in x.items()}
        return (total,total),(0,0), {m:(None,points[m],points[m]) for m in points}
    upper=10**10 if case=='B' else 5 if case=='G' else 10
    factor=Q(1,10**12) if case=='C' else Q(1,10**6) if case=='N' else Q(1)
    p=w[0]**2/(w[0]**2+w[1]**2)
    xs={"L1": upper if w[0]>=w[1] else 0, "L2":upper*p, "L_inf":upper*w[0]/(w[0]+w[1])}
    if case=='G':
        def d(x):
            return w[0]*(1-Q(x,upper)), w[1]*Q(x,upper)
        xs["L2"]=min(range(upper+1),key=lambda x:sum(v*v for v in d(x)))
        xs["L_inf"]=min(range(upper+1),key=lambda x:max(d(x)))
    def point(x): return (x*factor,x,4) if case=='F' else (x*factor,x)
    ideal, nadir=(upper*factor,0),(0,upper)
    if case=='F':
        ideal,nadir=ideal+(4,),nadir+(4,)
    return ideal,nadir,{m:(None,(v,),point(v)) for m,v in xs.items()}


def distances(point, ideal,nadir):
    return [float(abs(a-b)/abs(a-c)) if a!=c else 0 for a,b,c in zip(ideal,point,nadir)]


def metric(d, w,m):
    wd=[a*b for a,b in zip(d,w)]
    return sum(wd) if m=='L1' else math.hypot(*wd) if m=='L2' else max(wd)


def dominates_mixed(candidate, ideal, nadir):
    # Within each interval all three oriented differences are affine in y.
    # Intersect the inequalities that make the new point no worse.
    scales = [abs(a-b) for a,b in zip(ideal,nadir)]
    for x,b,lo,hi in mixed_intervals():
        z0, z1 = mixed_objectives(x,b,0), mixed_objectives(x,b,1)
        offset = [(z-c)*sign/scale for z,c,sign,scale in zip(z0,candidate,[1,-1,1],scales)]
        slope = [(v-u)*sign/scale for u,v,sign,scale in zip(z0,z1,[1,-1,1],scales)]
        for v,m in zip(offset,slope):
            limit = (-2e-8-v)/m
            if m > 0:
                lo = max(lo,limit)
            else:
                hi = min(hi,limit)
        if lo <= hi and max(v+m*y for y in (lo,hi) for v,m in zip(offset,slope)) > 2e-6:
            return True
    return False


def check(case, entry):
    if entry["code"]!=200:
        print(case,entry['code'],entry['response'])
        return [f"{case}: expected successful solve"]
    model, got = entry["request"],entry["response"]
    w=got['weights']
    ideal,nadir,ref=references(case,w)
    tol=2e-6
    failures=[]
    print(case,"weights=",w,"payoff=",got['payoff']['matrix'])
    for j,(a,b) in enumerate(zip(ideal,nadir)):
        scale=abs(a-b) or 1
        for observed,expected in ((got['payoff']['ideal_point'][j],a),(got['payoff']['anti_ideal_point'][j],b)):
            if abs(observed-expected)/scale>tol:
                print('  REF_FAIL',j,observed,float(expected))
                failures.append(f"{case}: incorrect payoff reference {j}")
    for m,s in got["solutions"].items():
        if not s["variables"]:
            print("  EMPTY", m,s['status'])
            failures.append(f"{case}: empty {m} solution")
            continue
        x=[s["variables"][v["name"]] for v in model['variables']]
        obj=[sum(a*b for a,b in zip(o['coefficients'],x)) for o in model['objectives']]
        error=[]
        for j,var in enumerate(model['variables']):
            lb,ub=var['lower_bound'],var['upper_bound']
            if (lb is not None and x[j]<lb-tol*max(1,abs(lb))) or (ub is not None and x[j]>ub+tol*max(1,abs(ub))):
                error.append("bounds")
            if var["var_type"]!="continuous" and abs(x[j]-round(x[j]))>tol:
                error.append("integrality")
        for c in model["constraints"]:
            lhs=sum(a*b for a,b in zip(c["coefficients"],x))
            rhs=c["rhs"]
            row_scale=max(abs(rhs),max(map(abs,c["coefficients"])))
            residual=(lhs-rhs)/(row_scale or 1)
            if (c['sense']=='>=' and residual<-tol) or (c['sense']=='<=' and residual>tol) or (c['sense']=='==' and abs(residual)>tol):
                error.append('constraint')
        if any(abs(a-b)>tol*(abs(zstar-znadir) or max(1,abs(zstar)))
               for a,b,zstar,znadir in zip(obj,s["objectives"],ideal,nadir)):
            error.append('reported objectives')
        d=distances(obj,ideal,nadir)
        want=metric(distances(ref[m][2],ideal,nadir),w,m)
        actual=metric(d,w,m)
        if abs(actual-want)>tol:
            error.append('suboptimal')
        if any(abs(a-b)>tol for a,b in zip(d,s["normalized_distances"])):
            error.append('deviations')
        if abs(s["aggregate_distance"]-actual)>tol:
            error.append('distance')
        if any(abs((1-v)*100-pct)>100*tol for v,pct in zip(d,s['achievement_pct'])):
            error.append('achievement')
        if s["status"] != "optimal":
            error.append("no optimality certificate")
        failures.extend(f"{case} {m}: {item}" for item in error)
        print(' ',m,s["status"],'Z=',obj,'d=',[round(v,9) for v in d],
              'opt=',round(want,9),'got=',round(s['aggregate_distance'],9),error)
    if case in ('D','E') and 'decision' in entry:
        decision_traces = entry['decision']['chart'] or []
        names = {trace['name'] for trace in decision_traces}
        if 'Solución L₂' not in names:
            failures.append(f"{case}: decision plot must identify L₂ as a solution")
        for trace in decision_traces:
            if trace['name']=='Región factible visible':
                outside=[(x,y) for x,y in zip(trace['x'],trace['y']) if x+y>10+tol]
                print("  REGION",trace['x'],trace['y'],"OUTSIDE",outside)
                if outside:
                    failures.append(f"{case}: plotted infeasible vertex")
    if case == 'H':
        points = got['pareto_points']
        dominated = [p['objectives'] for p in points if dominates_mixed(p['objectives'], ideal, nadir)]
        print("  Global dominance check",len(points),"points",len(dominated),"dominated")
    return failures


def verify_browser(data, directory):
    for case in "IJKLM":
        entry = data[case]
        if case in "IJ":
            assert entry["code"] == 400
            assert entry["status"] == ("Infactible" if case=="I" else "No acotado")
        else:
            assert "Errores de sintaxis" in entry["alert"]
            assert "request" not in entry
    assert not data["I"]["pngEnabled"]
    assert "E-5" in data["N"]["visual"]["table"]
    rows = list(csv.reader(data["N"]["csv"].lstrip("\ufeff").splitlines()))
    row = next(row for row in rows if row and row[0]=="L1")
    assert abs(float(row[5])-1e-5) < 1e-16
    flow = data["FLOW"]
    for i in (0,1):
        run = flow[f"extreme{i}"]
        assert run["response"]["weights"] == [i,1-i]
        for solution in run["response"]["solutions"].values():
            assert solution["aggregate_distance"] < 1e-9
    rapid = flow["rapid"]["response"]
    assert abs(rapid["weights"][0]-0.73) < 1e-9
    assert flow["invalidWeights"] == {"status":"Error", "excelEnabled":False}
    # Check the actual Plotly traces against both the response and closed form.
    traces = flow["sensitivity"]["chart"]
    for i,name in enumerate(("Beneficio","Costo")):
        l2 = [t for t in traces if t["name"] == name and t["axis"] == "x2"]
        assert len(l2) == 2
        sweep = rapid["weight_sensitivity"]["l2"]
        for weight, deviation, row in zip(l2[0]["x"], l2[0]["y"], sweep, strict=True):
            fraction = weight**2/(weight**2+(1-weight)**2)
            expected = 100*(1-fraction if i==0 else fraction)
            assert abs(deviation-expected) < 2e-4
            assert deviation == row["deviations_pct"][i]
        assert abs(l2[1]["x"][0]-0.73) < 1e-9
        assert abs(l2[1]["y"][0] - rapid["solutions"]["L2"]["normalized_distances"][i]*100) < 1e-9
    mixed = data["H"]
    for key,label in (("L1","L₁"),("L2","L₂"),("L_inf","L∞")):
        trace = next(t for t in mixed["space3d"]["chart"] if t["name"] == label)
        assert [trace[axis][0] for axis in "xyz"] == mixed["response"]["solutions"][key]["objectives"]
    assert flow["mobile"]["scrollWidth"] <= flow["mobile"]["width"] + 1
    # After the newer exercise is loaded, both the axes and final request match it.
    assert flow["final"]["axis"] == flow["switch"]["response"]["payoff"]["headers"][0]
    assert flow["edit"]["response"]["payoff"]["ideal_point"] == [6,0]
    for entry in flow["import"].values():
        assert entry["code"] == 200
        assert entry["response"]["weights"] == rapid["weights"]
        assert entry["request"]["constraints"] == flow["rapid"]["request"]["constraints"]
        assert entry["request"]["objectives"] == flow["rapid"]["request"]["objectives"]
        assert entry["response"]["payoff"]["matrix"] == rapid["payoff"]["matrix"]
        for metric,s in rapid["solutions"].items():
            assert abs(entry["response"]["solutions"][metric]["aggregate_distance"]-s["aggregate_distance"]) < 1e-12
    definition = json.loads((directory/flow["JSON"]["filename"]).read_text())
    assert definition["name"] == "RT A" and definition["weights"] == rapid["weights"]
    with (directory/flow["CSV"]["filename"]).open(encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    for metric,s in rapid["solutions"].items():
        row=next(row for row in rows if row and row[0]==metric)
        assert abs(float(row[2])-s["aggregate_distance"])<1e-12
        assert all(abs(float(row[5+j])-z)<1e-12 for j,z in enumerate(s["objectives"]))
    with ZipFile(directory/flow["Excel"]["filename"]) as workbook:
        # The second worksheet is Soluciones_Compromiso, with one row per metric.
        sheet = ET.fromstring(workbook.read("xl/worksheets/sheet2.xml"))
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        for i,s in enumerate(rapid["solutions"].values(),2):
            values = [sheet.find(f".//s:c[@r='{column}{i}']/s:v",ns).text for column in "CFG"]
            assert abs(float(values[0])-s["aggregate_distance"])<1e-12
            assert all(abs(float(v)-z)<1e-12 for v,z in zip(values[1:],s["objectives"]))
    png = (directory/flow["PNG"]["filename"]).read_bytes()
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert (int.from_bytes(png[16:20]),int.from_bytes(png[20:24])) == (2400,1500)
    events = json.loads((directory/"events.json").read_text())
    assert not [e for e in events if "error" in e], events
    print("Browser, graphics and downloads verified")


if __name__=='__main__':
    path = Path(sys.argv[1])
    data = json.loads(path.read_text())
    failures = []
    for case in 'ABCDEFGHNO':
        if case in data:
            failures.extend(check(case, data[case]))
    print('Mixed exact reference:', mixed_reference())
    if '--verify' in sys.argv:
        assert not failures, failures
        verify_browser(data, path.parent)

import sys,json,time,statistics,random,resource,platform,math
sys.path.insert(0,sys.argv[1])
from vo_regular_bp import ContextGraph,forbidden_substring_acceptor,run_bp,most_probable_sequence
from vo_regular_bp.product_bp import _build_product_graph
from vo_regular_bp._numerics import log_sum
w=json.load(open(sys.argv[2]))[int(sys.argv[3])]
def measure(fn):
    fn();values=[]
    for _ in range(3):
        start=time.perf_counter();fn();values.append((time.perf_counter()-start)*1000)
    return statistics.median(values)
def build():
    if 'backoffWeight' in w:return ContextGraph.from_backoff_sequences(w['sequences'],max_order=w['order'],backoff_weight=w['backoffWeight'])
    return ContextGraph.from_sequences(w['sequences'],max_order=w['order'])
graph_ms=measure(build);g=build();a=forbidden_substring_acceptor([w['forbidden']]);n=w['length'];start,layers,rows=_build_product_graph(g,a,length=n)
def backward():
    scores={q:0. if a.is_accepting(q[1])else -float('inf')for q in layers[n]}
    for t in range(n-1,-1,-1):scores={q:log_sum(math.log(e.probability)+math.log(e.transition_weight)+scores.get(e.next_state,-float('inf'))for e in rows[t].get(q,())if e.probability>0)for q in layers[t]}
    return scores
bp=run_bp(g,a,length=n)
r=dict(name=w['name'],tokens=sum(map(len,w['sequences'])),graph=graph_ms,product=measure(lambda:_build_product_graph(g,a,length=n)),backward=measure(backward),sample=measure(lambda:bp.sample(rng=random.Random(1))),sample100=measure(lambda:bp.sample_many(100,rng=1)),optimization=measure(lambda:most_probable_sequence(g,a,length=n)),states=bp.unique_product_state_count,layerStates=bp.time_indexed_product_state_count,peakLayerStates=max(map(len,layers)),edges=bp.product_edge_count,logPartition=bp.log_partition_function)
r['peakRSSMB']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/(1024**2 if platform.system()=='Darwin' else 1024)
print(json.dumps(r))

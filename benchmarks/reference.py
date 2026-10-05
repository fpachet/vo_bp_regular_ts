import sys,json,time,statistics,random,math
sys.path.insert(0,sys.argv[1])
from vo_regular_bp import ContextGraph,forbidden_substring_acceptor,run_bp,most_probable_sequence
from vo_regular_bp.product_bp import _build_product_graph
from vo_regular_bp._numerics import log_sum
# Measure log backward separately, matching the TS numerical strategy.
def backward(g,a,n):
    start,layers,rows=_build_product_graph(g,a,length=n)
    def compute():
        scores={q:0. if a.is_accepting(q[1])else -float('inf')for q in layers[n]}
        for t in range(n-1,-1,-1):
            scores={q:log_sum(math.log(e.probability)+math.log(e.transition_weight)+scores.get(e.next_state,-float('inf'))for e in rows[t].get(q,())if e.probability>0)for q in layers[t]}
        return scores
    return compute
def measure(fn):
    fn();xs=[]
    for _ in range(5):
        t=time.perf_counter();fn();xs.append((time.perf_counter()-t)*1000)
    return statistics.median(xs)
out=[]
for w in json.load(open('benchmarks/workloads.json')):
    build=lambda:ContextGraph.from_sequences(w['sequences'],max_order=w['order'])
    g=build();a=forbidden_substring_acceptor([w['forbidden']]);n=w['length'];bp=run_bp(g,a,length=n)
    backward_fn=backward(g,a,n)
    out.append(dict(name=w['name'],graph=measure(build),product=measure(lambda:_build_product_graph(g,a,length=n)),backward=measure(backward_fn),sample=measure(lambda:bp.sample(rng=random.Random(1))),sample100=measure(lambda:bp.sample_many(100,rng=1)),optimization=measure(lambda:most_probable_sequence(g,a,length=n)),states=bp.unique_product_state_count,layerStates=bp.time_indexed_product_state_count,edges=bp.product_edge_count))
print(json.dumps(out))

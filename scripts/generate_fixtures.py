"""Generate pinned Python outputs and independently enumerate tiny models.
Usage: python3 scripts/generate_fixtures.py /path/to/vo_regular_bp
"""
import sys, json, math, random, itertools, subprocess
from pathlib import Path
reference=Path(sys.argv[1]).resolve()
sys.path.insert(0,str(reference))
from vo_regular_bp import ContextGraph, DFA, run_bp, most_probable_sequence, positional_acceptor, forbidden_substring_acceptor, all_of, max_order_acceptor, meter_acceptor
rng=random.Random(271828)
cases=[]
def add(name,g,a,n,exhaustive=True):
    # Materialize all horizon-reachable automaton rows with stable integer IDs.
    states=[a.start_state]; ids={a.start_state:0}; transitions=[];weights=[];layer={a.start_state}
    for t in range(n):
        nxt=set()
        for q in sorted(layer,key=repr):
            for s in sorted(g.alphabet,key=repr):
                r=a.next_state(q,s)
                if r is not None:
                    if r not in ids:ids[r]=len(states);states.append(r)
                    nxt.add(r)
        layer=nxt
    for q in states:
        transitions.append({});weights.append({})
        for s in sorted(g.alphabet,key=repr):
            r=a.next_state(q,s)
            if r in ids:
                transitions[-1][s]=ids[r];weights[-1][s]=a.transition_weight(q,s)
    contexts=sorted(g.states,key=lambda c:(len(c),repr(c)));ci={c:i for i,c in enumerate(contexts)}
    bp=run_bp(g,a,length=n);best=most_probable_sequence(g,a,length=n)
    accepted=[]
    if exhaustive:
        for xs in itertools.product(sorted(g.alphabet,key=repr),repeat=n):
            if a.accepts(xs) and g.probability(xs)>0:
                q=a.start_state;w=g.probability(xs)
                for s in xs:w*=a.transition_weight(q,s);q=a.next_state(q,s)
                accepted.append({'sequence':xs,'weight':w,'conditional':bp.conditional_probability(xs)})
        assert math.isclose(sum(x['weight'] for x in accepted),bp.partition_function,rel_tol=1e-10,abs_tol=1e-12)
        if best.feasible:assert math.isclose(math.exp(best.log_weight),max(x['weight'] for x in accepted),rel_tol=1e-10)
    cases.append(dict(name=name,alphabet=sorted(g.alphabet,key=repr),contexts=contexts,rows=[[dict(symbol=e.symbol,probability=e.probability,nextState=ci[e.next_state])for e in g.outgoing(c)]for c in contexts],startState=ci[g.start_state],maxOrder=g.max_order,dfa=dict(transitions=transitions,weights=weights,accepting=[a.is_accepting(q)for q in states]),length=n,partition=bp.partition_function,logPartition=bp.log_partition_function if math.isfinite(bp.log_partition_function)else None,best=dict(feasible=best.feasible,sequence=best.sequence,logWeight=best.log_weight if best.feasible else None),accepted=accepted,exhaustive=exhaustive,productEdgeCount=bp.product_edge_count,productStateCount=bp.unique_product_state_count))
g=ContextGraph.from_sequences(['ABRACADABRA','BANANA','BARBARA','CABANA'],max_order=2)
add('trained-forbidden',g,all_of(positional_acceptor(4,{0:{'B'},3:{'A'}}),forbidden_substring_acceptor(['BRA'])),4)
g=ContextGraph.from_probabilities({():{'a':.6,'b':.4},('a',):{'x':.5,'y':.5},('b',):{'x':1}})
add('greedy-is-not-optimal',g,positional_acceptor(2),2)
g=ContextGraph.from_counts({():{'a':1,'b':1}},max_order=0)
add('empty',g,positional_acceptor(0),0)
add('infeasible',g,positional_acceptor(1,{0:{'z'}}),1)
add('maxorder',g,max_order_acceptor(['abba'],max_order=1),4)
add('meter',g,meter_acceptor(['weak','strong'],{'a':'weak','b':'strong'}),2)
add('underflow',g,positional_acceptor(1200,{i:{'a'}for i in range(1200)}),1200,False)
for j in range(30):
    probs={():{'a':rng.randint(1,8),'b':rng.randint(1,8)},('a',):{'a':rng.randint(1,8),'b':rng.randint(1,8)},('b',):{'a':rng.randint(1,8),'b':rng.randint(1,8)}}
    g=ContextGraph.from_counts(probs,max_order=1)
    a=DFA(start_state=0,accept_states={rng.randrange(3)},transitions={q:{s:rng.randrange(3)for s in 'ab' if rng.random()>.15}for q in range(3)},transition_weights={q:{s:rng.choice([0,.5,1,2])for s in 'ab'}for q in range(3)})
    add(f'random-{j}',g,a,4)
for j in range(40):
    sequences=[''.join(rng.choice('ab') for _ in range(rng.randint(6,16))) for _ in range(4)]
    order=j%5;backoff=[None,0.,.25,1.][j%4]
    g=ContextGraph.from_sequences(sequences,max_order=order) if backoff is None else ContextGraph.from_backoff_sequences(sequences,max_order=order,backoff_weight=backoff)
    a=all_of(forbidden_substring_acceptor(['aaa']),positional_acceptor(6,{5:{rng.choice('ab')}}),DFA(start_state=0,accept_states={0},transition_func=lambda q,s:0,transition_weight_func=lambda q,s: .5 if s=='a' else 1.5))
    add(f'variable-order-{j}',g,a,6)
    cases[-1]['training']=dict(sequences=sequences,maxOrder=order,backoffWeight=backoff)
for name,backoff in [('strict-maxorder',None),('backoff-maxorder',.25)]:
    sequences=['abab'];g=ContextGraph.from_sequences(sequences,max_order=1) if backoff is None else ContextGraph.from_backoff_sequences(sequences,max_order=1,backoff_weight=backoff)
    add(name,g,max_order_acceptor(sequences,1),6)
    cases[-1]['training']=dict(sequences=sequences,maxOrder=1,backoffWeight=backoff)
try: revision=subprocess.check_output(['git','-C',str(reference),'rev-parse','HEAD'],text=True).strip()
except Exception:revision='unknown'
Path(sys.argv[2] if len(sys.argv)>2 else 'fixtures/python-golden.json').write_text(json.dumps(dict(referenceRevision=revision,seed=271828,cases=cases),indent=2,allow_nan=False)+'\n')
print(f'Generated {len(cases)} fixtures; Python DP agrees with exhaustive enumeration.')

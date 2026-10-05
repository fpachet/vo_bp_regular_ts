# Local benchmark report

Median of five warmed runs, milliseconds. These small workloads are illustrative, not a general speed claim. Python uses its existing engine for sampling and optimization; its isolated backward column uses a log recurrence to match TypeScript. Optimization includes fresh product construction in both runtimes. No browser performance or memory measurements are claimed.

|Workload|Runtime|Graph|Product|Backward|1 sample|100 samples|Optimize|Unique states|Layer states|Layer edges|
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
|toy|Node|0.110|0.110|0.087|0.025|0.572|0.148|19|379|468|
|toy|Python|0.120|0.196|0.361|0.029|2.061|0.379|19|379|468|
|text|Node|0.905|4.149|7.789|0.074|2.905|7.712|346|40998|68729|
|text|Python|2.236|20.950|48.827|0.090|8.405|45.545|346|40998|68729|
|melody|Node|0.071|0.111|0.104|0.031|1.061|0.141|19|526|530|
|melody|Python|0.106|0.240|0.485|0.048|4.086|0.470|19|526|530|
|synthetic|Node|5.544|0.344|0.671|0.021|1.291|0.765|144|5226|5225|
|synthetic|Python|9.361|2.456|4.793|0.063|5.209|4.521|144|5226|5225|

Environment: Node v24.3.0, darwin/arm64. Regenerate with npm run benchmark -- /path/to/vo_regular_bp. Raw results: results.json. Corpus inputs: workloads.json.

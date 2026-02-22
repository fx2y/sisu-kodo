# ADR-008 Defect Closure Matrix (S0/S1)

| class     | failure                             | closure law                                           |
| --------- | ----------------------------------- | ----------------------------------------------------- |
| ingress   | schema/json mapped to 500           | typed lattice; deterministic 400 + zero writes        |
| targeting | invalid run/gate accepted           | resolve `(run,gate,topic)` before write/send; 404/409 |
| dedupe    | same key, diff payload/topic silent | conflict compare hash+topic+gate; mismatch=409        |
| x-once    | ledger finalized before effect      | finalize only after observable/confirmed effect       |
| ABI       | prompt/result/decision drift        | strict Ajv contracts + enforced emit/read asserts     |
| UI        | enum drift (`v` vs `vs`)            | structural parser + explicit contract-error card      |
| parity    | Next/manual route mismatch          | shared services + parity tests in split topology      |
| restart   | duplicate prompts / queued wedges   | prompt marker + queue init pre-launch/relaunch        |
| harness   | SYS table races                     | per-invocation SYS DB + serialized destructive reset  |
| load      | pre-schema probe crash / 53300 risk | readiness barrier + bounded concurrency envelope      |
| policy    | grep-only probes                    | semantic probes with bad/fail + good/pass self-test   |

Primary envelope now encoded by tutorial/proof lanes: `quick`, `check`, `full`, `hitl:load:1k`, `hitl:burst:soak`, `-f test:soak:hitl`.

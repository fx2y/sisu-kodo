#!/usr/bin/env bash
set -euo pipefail

task_json="$(mise tasks ls --json)"

bad=0
while IFS= read -r task; do
  name="$(jq -r '.name' <<<"$task")"
  run_len="$(jq -r '.run | length' <<<"$task")"
  sources_len="$(jq -r '.sources | length' <<<"$task")"
  outputs_type="$(jq -r '.outputs | type' <<<"$task")"
  outputs_len="$(
    jq -r '
      if (.outputs | type) == "array" then (.outputs | length)
      elif (.outputs | type) == "object" then (.outputs | length)
      else 0
      end
    ' <<<"$task"
  )"

  if [ "$run_len" -eq 0 ]; then
    continue
  fi

  # Explicit always-run exceptions from constitution.
  if [[ ! "$name" =~ ^(db:reset|db:sys:reset|test:e2e|test:integration:mock:file|oc:daemon:.*|policy)$ ]]; then
    if [ "$sources_len" -eq 0 ]; then
      echo "task missing sources: $name" >&2
      bad=1
    fi
  fi

  if [[ "$name" =~ ^(test:|wf:|oc:|sbx:|build$|check:integration$|check:crashdemo$) ]] && \
    [[ ! "$name" =~ ^(db:reset|db:sys:reset|test:e2e|test:integration:mock:file|oc:daemon:.*) ]]; then
    if [ "$outputs_len" -eq 0 ]; then
      echo "expensive task missing outputs: $name" >&2
      bad=1
    fi
  fi

  if [ "$name" = "db:reset" ] || [ "$name" = "db:sys:reset" ]; then
    if [ "$outputs_type" != "array" ] || [ "$outputs_len" -ne 0 ]; then
      echo "reset task must not declare cached outputs: $name" >&2
      bad=1
    fi
  fi
done < <(jq -c '.[]' <<<"$task_json")

exit "$bad"

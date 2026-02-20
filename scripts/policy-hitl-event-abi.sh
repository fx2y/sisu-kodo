#!/bin/bash
set -e

# Policy: HITL Event ABI must be frozen. 
# 1. No changes to key patterns in hitl-topic.ts
# 2. No changes to toHitl* keys in keys.ts
# 3. No field removal from v1 schemas

echo "--- HITL Event ABI Policy Probe ---"

# 1. Check key pattern stability
grep -F 'HITL_GATE_KEY_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/;' src/lib/hitl-topic.ts || (echo "FAIL: HITL_GATE_KEY_PATTERN changed" && exit 1)

# 2. Check key function stability
grep -q 'return `ui:${normalizedGate(gateKey)}`;' src/workflow/hitl/keys.ts || (echo "FAIL: toHitlPromptKey changed" && exit 1)
grep -q 'return `ui:${normalizedGate(gateKey)}:result`;' src/workflow/hitl/keys.ts || (echo "FAIL: toHitlResultKey changed" && exit 1)
grep -q 'return `decision:${normalizedGate(gateKey)}`;' src/workflow/hitl/keys.ts || (echo "FAIL: toHitlDecisionKey changed" && exit 1)
grep -q 'return `ui:${normalizedGate(gateKey)}:audit`;' src/workflow/hitl/keys.ts || (echo "FAIL: toHitlAuditKey changed" && exit 1)

# 3. Check schema field stability (GatePrompt v1)
grep -q 'schemaVersion: { type: "integer", minimum: 1 }' src/contracts/hitl/gate-prompt.schema.ts || (echo "FAIL: GatePrompt schemaVersion missing/changed" && exit 1)
grep -q 'formSchema: { type: "object", additionalProperties: true, required: \[\] }' src/contracts/hitl/gate-prompt.schema.ts || (echo "FAIL: GatePrompt formSchema missing/changed" && exit 1)

echo "PASS: HITL Event ABI policy verified."

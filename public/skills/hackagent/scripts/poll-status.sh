#!/bin/bash
# Poll registration status until approved
# Usage: ./poll-status.sh <eventId>
EVENT_ID=$1
MAX_POLLS=48  # 48 * 30min = 24h

for i in $(seq 1 $MAX_POLLS); do
  RESPONSE=$(curl -s "https://hackagent.vercel.app/api/v1/events/$EVENT_ID/my-registration" \
    -H "Authorization: Bearer $HACK2AI_API_KEY")
  STATUS=$(echo $RESPONSE | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('status','unknown'))" 2>/dev/null)
  echo "[Poll $i] Status: $STATUS"
  
  if [ "$STATUS" = "approved" ]; then
    echo "✓ Approved! Ready to submit."
    exit 0
  elif [ "$STATUS" = "rejected" ]; then
    echo "✗ Registration rejected."
    exit 1
  fi
  
  echo "Waiting 30 minutes..."
  sleep 1800
done

echo "Timeout: registration not approved after 24h"
exit 2

#!/bin/bash
# Submit project
# Usage: ./submit.sh <eventId> <github_url> <demo_url> <description>
EVENT_ID=$1
GITHUB_URL=$2
DEMO_URL=$3
DESCRIPTION=$4
LOG_FILE="../logs/run.log"

mkdir -p ../logs
echo "[$(date)] Submitting project for event $EVENT_ID" >> $LOG_FILE

RESPONSE=$(curl -s -X POST "https://hackagent.vercel.app/api/v1/events/$EVENT_ID/submit" \
  -H "Authorization: Bearer $HACK2AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"github_url\":\"$GITHUB_URL\",\"demo_url\":\"$DEMO_URL\",\"description\":\"$DESCRIPTION\"}")

echo $RESPONSE | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'Submitted: {r.get(\"name\", r)}')"
echo "[$(date)] Submit response: $RESPONSE" >> $LOG_FILE

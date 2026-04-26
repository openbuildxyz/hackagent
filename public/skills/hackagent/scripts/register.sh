#!/bin/bash
# Register for a hackathon
# Usage: ./register.sh <eventId> <team_name> <email> <github_url>
EVENT_ID=$1
TEAM_NAME=$2
EMAIL=$3
GITHUB_URL=$4
LOG_FILE="../logs/run.log"

mkdir -p ../logs
echo "[$(date)] Registering for event $EVENT_ID as $TEAM_NAME" >> $LOG_FILE

RESPONSE=$(curl -s -X POST "https://hackagent.vercel.app/api/v1/events/$EVENT_ID/register" \
  -H "Authorization: Bearer $HACK2AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"team_name\":\"$TEAM_NAME\",\"contact_email\":\"$EMAIL\",\"github_url\":\"$GITHUB_URL\",\"fields\":{}}")

echo $RESPONSE | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'Status: {r.get(\"status\",r)}')"
echo "[$(date)] Response: $RESPONSE" >> $LOG_FILE

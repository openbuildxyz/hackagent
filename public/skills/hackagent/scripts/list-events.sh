#!/bin/bash
# List open hackathons on HackAgent
curl -s https://hackagent.vercel.app/api/v1/events | \
  python3 -c "
import sys, json
events = json.load(sys.stdin)
for e in events:
    print(f\"ID: {e['id']}\")
    print(f\"Name: {e['name']}\")
    print(f\"Status: {e['status']}\")
    print(f\"Deadline: {e.get('registration_deadline','N/A')}\")
    print('---')
"

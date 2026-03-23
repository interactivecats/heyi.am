#!/bin/bash
# Load .env and start Phoenix dev server
set -a
[ -f .env ] && source .env
set +a
exec mix phx.server

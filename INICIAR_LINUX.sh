#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
  echo 'Edita backend/.env (MySQL, JWT_SECRET y Groq), luego ejecuta este script de nuevo.'
  exit 0
fi
npm install
npm run db:doctor
npm run db:migrate
npm run dev

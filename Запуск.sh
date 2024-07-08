#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]
then
    npm i
fi
npm run start

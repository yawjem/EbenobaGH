#!/usr/bin/env bash
# Run this ON YOUR COMPUTER (needs Node 20+). It creates a fresh Expo project and
# copies the Ebenoba source over it, so every dependency gets a version that matches
# your Expo SDK (that is why there is no hand-written package.json here).
set -e
APP=${1:-ebenoba-app}
npx create-expo-app@latest "$APP" --template blank-typescript --no-install
cd "$APP"
rm -rf App.tsx index.ts assets
cp -R ../app ../src ../assets ./
cp ../app.json ../.env.example ./
cp .env.example .env
npm install
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants \
  expo-status-bar expo-linking expo-web-browser expo-notifications expo-device expo-linear-gradient expo-image-picker \
  @react-native-async-storage/async-storage react-native-url-polyfill \
  @expo/vector-icons @supabase/supabase-js
# expo-router entry point
node -e "const p=require('./package.json');p.main='expo-router/entry';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"
echo ""
echo "Done. 1) put your Supabase URL + anon key in $APP/.env   2) cd $APP && npx expo start"

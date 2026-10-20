# MythTube

A Netflix-style streaming app UI for Android (React Native + Expo SDK 58), with mock content and no backend.
All titles, people and artwork are placeholders. Posters come from picsum.photos and videos from Google's public sample bucket.

## Build (GitHub Actions — nothing builds locally)

1. Create an empty GitHub repository (for example `mythtube`).
2. From this folder:
   ```sh
   git init
   git add .
   git commit -m "MythTube phase 1"
   git branch -M main
   git remote add origin https://github.com/<you>/mythtube.git
   git push -u origin main
   ```
3. On GitHub, open **Actions → Android APK**. Each push to `main` runs it, and you can also start it from **Run workflow**.
4. When the run finishes (about 15–25 min), download the **MythTube-apk** artifact (a zip containing `app-release.apk`).
5. Copy the APK to your phone and open it. Allow "Install unknown apps" for your file manager if Android asks.

The workflow runs `npm install`, then `expo install --fix`, then `tsc --noEmit`, then `expo prebuild`, then Gradle `assembleRelease` (arm64-v8a only).
If the type check fails, the log shows the exact file and line.

The release APK is signed with the default debug keystore from the Expo template. That's fine for sideloading, but not for the Play Store.

## Try it

- Sign in with any email and a password of 4 or more characters.
- Pick a profile. You can then use Home, Games, New & Hot and My MythTube.
- Data persists on the device: My List, ratings, reminders, watch progress and downloads (downloads are simulated).

## Project layout

```
App.tsx                 fonts, splash, providers, navigation container
src/theme/tokens.ts     colors/spacing/type/motion (from REA evidence, docs/NETFLIX_A_TO_Z.md M01)
src/data/               mock catalog + image URL builders
src/state/AppState.tsx  app state + AsyncStorage persistence
src/navigation/         root stack + bottom tabs
src/components/         shared UI
src/screens/            one file per screen
tools/make_icons.py     regenerates assets/*.png
docs/                   REA feature inventory, plan, progress
```

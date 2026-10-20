# MythTube — Plan (Netflix A-to-Z UI clone)

App name: **MythTube** (suggested package `com.mythbrix.mythtube`).
Scope: Netflix Android UI, buttons, navigation, styling, colors and feature
shell; mock content; no backend.

## Hard constraint: nothing builds on this PC

This PC has 3.6 GB RAM (about 0.8 GB free) and an i3-7100U, so:
- No `npm install`, Metro/Expo dev server, Gradle, JDK, Android SDK, emulator or JADX here.
- This PC is used only for writing code and markdown, plus small read-only analysis scripts.
- All builds run in the cloud. The finished APK is installed straight onto the phone.

## Phase 1 — REA evidence (done, static)

Output: `docs/NETFLIX_A_TO_Z.md` (feature inventory with IDs) and `docs/rea-evidence/`.
- REA `inspect-artifact` on Netflix 9.87.1 (archive inventory, hash-verified).
- `resources.arsc` decoded read-only: English strings, colors, dimens, integers.
- Manifest string pool: activities, deep links, permissions.
- Lottie animations, fonts and the Hawkins design system identified.

Optional Phase 1b: connect a phone and use REA `capture-adb-screen` and
`inspect-adb-display` (lightweight, nothing builds) to screenshot each Netflix
screen and confirm the [K] items and pixel layout.

## Phase 2 — Scope decision (waiting on you)

You mark the feature IDs to remove in `docs/NETFLIX_A_TO_Z.md`. I then freeze `docs/SCOPE.md`.

## Phase 3 — Write code (on this PC, no build)

Stack: Expo SDK 58 / React Native 0.88 / TypeScript, React Navigation,
Reanimated, expo-image, expo-video, expo-linear-gradient, expo-blur,
react-native-svg, lottie-react-native (with our own original animations).

```
src/theme/tokens.ts     colors, spacing, type, motion (from M01 evidence)
src/data/mock.ts        titles, rows, episodes, profiles, games, notifications
src/components/         Billboard, PosterRow, Top10Row, ContinueRow, Chip,
                        Button, BottomSheet, IconButton, Toast, Logo
src/screens/            one file per kept module (M02…M20)
src/navigation/         RootStack + Tabs
src/state/              profiles, My List, ratings, downloads, reminders (in-memory + AsyncStorage)
```

Performance target is 60fps on a mid-range Android phone:
- memoized rows and horizontal FlatLists with `getItemLayout`
- small fixed-size images through expo-image
- scroll animations as Reanimated worklets
- Hermes and the New Architecture

## Phase 4 — Cloud build and checks

- **GitHub Actions** (free; needs a GitHub repo): runs `tsc`, lint and
  `expo prebuild` + Gradle `assembleRelease` on GitHub's servers, then uploads
  `MythTube.apk` as a downloadable artifact.
- Alternative: **EAS Build** (free tier; needs an expo.dev account).
- Install: download the APK on the phone and tap to install.
- Every push triggers a new build. Type errors are caught in CI, not locally.

## Phase 5 — Parity pass

Compare MythTube against Netflix screen by screen on the phone (Phase 1b
screenshots if available), fix spacing, color and motion deltas, then rebuild in CI.

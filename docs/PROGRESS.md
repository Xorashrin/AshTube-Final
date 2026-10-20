# Phase 1 development — progress

Status: **code complete. Ready to push to GitHub and build with Actions.** Nothing has been compiled or run yet; the first CI run is the first type check.

## Feature coverage (IDs from NETFLIX_A_TO_Z.md)

| Area | Done in phase 1 |
| --- | --- |
| M01 tokens | colors, spacing, type, motion; Inter + Bebas Neue substitute fonts |
| M02 splash | animated M logo with glow |
| M03 sign-in (mock) | landing carousel with collage, top links, GET STARTED, Sign In with floating labels and show/hide, any credentials accepted |
| M05 profiles | Who's Watching grid, select animation, manage mode, lock icon, kids avatar, Switch Profiles sheet |
| M06 tabs | Home, Games, New & Hot, My MythTube (with avatar tab icon) |
| M07 home | "For {name}" header, color fade on scroll, chips that collapse on scroll, TV Shows / Movies / Categories filters, billboard with tint gradient, Continue Watching (progress + ⓘ/⋮ sheet), Only on MythTube tall row, Top 10 numerals, My List row, games row, genre rows |
| M08 details | backdrop + play, kicker, meta tags, Top 10 line, Play/Resume, Download (simulated), resume bar, synopsis expand, cast/creators, My List / Rate (3-way) / Share, Episodes / More Like This / Trailers & More tabs, season picker, episode rows with download states |
| M09 player | landscape expo-video, auto-hiding controls, ±10 s + double-tap seek, scrub bar, Speed panel, Lock with two-tap unlock, Episodes panel, Audio & Subtitles panel, Skip Intro, Next Episode, autoplay next, progress saved |
| M10 search | recommended list, live results grid, games results, no-results state |
| M11 New & Hot | sticky emoji chips synced with scroll, Coming Soon date column + Remind Me, Everyone's Watching, Top 10 TV / Movies |
| M12 My MythTube | profile header + switcher, Notifications, Downloads, Liked / My List / Trailers rows with Share, menu sheet, sign out |
| M13 My List | filters, sort sheet, edit/remove, empty states |
| M14 downloads | grouped list, simulated progress, edit/delete, Smart Downloads toggle, storage bar, empty state |
| M20 settings | playback/notification/download toggles, diagnostics, about, sign out |
| M25 | toasts, bottom sheets, full-screen pickers |

Visual-only placeholders (show a toast): cast, games, voice search, account, help, profile editing/adding.

## Next phases (not started)
- Profile add/edit/PIN screens (M05.5–M05.6), Clips feed (M15.1), muted trailer autoplay on details/billboard (M07.15)
- Parity pass against device screenshots (REA `capture-adb-screen`)

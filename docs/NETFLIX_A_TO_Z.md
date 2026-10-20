# Netflix Android — A-to-Z Feature Inventory (for the MythTube clone)

> Purpose: list **everything** the Netflix Android app contains, so you can mark
> what MythTube keeps, mocks, or drops. Each feature has an ID (e.g. `M08.3`).
> Reply with IDs to remove — e.g. "remove M21, M23, M09.14".

## How this was produced (REA evidence)

| Item | Value |
| --- | --- |
| Target | `com.netflix.mediaclient` **9.87.1 build 9 (74620)**, minSdk 28, targetSdk 37 |
| Source | APKPure XAPK (third-party mirror — authenticity **not verified**) |
| Base APK SHA-256 | `4610837fddf76d6e51175a0069b7742929ea657314336e57e69fc8b1ef134db2` |
| REA `inspect-artifact` | Evidence `ev_73ea6f5d…eec` → inventory `ev_5b696177…5afcd5` (6,022 archive entries, hash-verified, `complete-within-substeps`) |
| Resource decode | `resources.arsc` parsed read-only (`docs/rea-evidence/arsc.py`) → 3,175 unique English strings, 448 colors, 978 dimens, 46 integers, 15 Lottie animations, 12 fonts |
| Manifest | String pool read from binary `AndroidManifest.xml` (activities, deep links, permissions) |

Evidence tags used below:
- **[S]** exact UI string found in the APK
- **[R]** resource found (color / Lottie / font / dimen / integer)
- **[M]** manifest declaration
- **[K]** inference from known Netflix UI — **not** observed in this APK; needs a device screenshot to confirm

**Limitations (stated honestly):**
- This is static evidence only. Nothing was executed, and no screenshots of the real app were taken.
- Pixel layout (exact positions and sizes per screen) is **unknown**. Netflix's UI is Jetpack Compose, so layouts live in code, which wasn't decompiled. JADX needs Java and too much RAM for this PC.
- Resource names are obfuscated (`res/raw/aq.xml`), so colors and dimens are known by **value**, not by role. Roles below are inferred.
- Tab order and some screen arrangements are tagged [K] until confirmed with a phone screenshot (REA `capture-adb-screen`).

Raw extracts: `docs/rea-evidence/` (strings-en.txt, colors.txt, dimens.txt, integers.txt).

---

## M00 — App architecture facts

| ID | Fact | Evidence |
| --- | --- | --- |
| M00.1 | Very few activities: `LaunchActivity`, `PlayerActivity`, `SignupNative*Activity`, `SignupActivity` (web), `UIWebViewActivity`, `DiagnosisActivity`. Everything else is in-app navigation inside one activity | [M] |
| M00.2 | UI built with **Jetpack Compose + Material3 + Netflix "Hawkins" design system** (`com.netflix.hawkins.*`) | [M][R] |
| M00.3 | Phone is **portrait-locked** (`android.hardware.screen.portrait`); only the player goes landscape | [M] |
| M00.4 | Separate tablet variants (`*TabletActivity`, `sw600dp` layouts and dimens) | [M][R] |
| M00.5 | Deep links: `nflx://`, `www.netflix.com`, `app.netflix.com`, `games.netflix.com`, `qr.netflix.com`, `msg.netflix.com` | [M] |
| M00.6 | Google Cast built in (`CastOptionsProvider`), Picture-in-Picture, CameraX (QR scan, photos), microphone (voice chat), Bluetooth/local network (casting) | [M] |
| M00.7 | GraphQL (Apollo) backend client, Firebase push notifications | [M] |
| M00.8 | Localized into 30+ languages | [R] |

## M01 — Design tokens (brand look)

### Colors (by value; role inferred)
| Token | Value | Evidence |
| --- | --- | --- |
| Brand red | `#E50914` | [R] |
| Red pressed/dark | `#C11119` | [R] |
| Red light/error | `#EB3942` | [R] |
| Link / info blue | `#0071EB` (e.g. "%1$s GB" highlight, "See all plans") | [S][R] |
| Background | `#000000` | [R] |
| Surfaces (dark → light) | `#0F0F0F`, `#121212`, `#1F1F1F` (night surface), `#232323`, `#25272B`, `#262626`, `#333333`, `#414141`/`#424242`, `#444444`, `#4D4D4D` | [R] |
| Secondary text grays | `#737373`, `#808080` (40% alpha), `#BDBDBD`, `#BFBFBF` ("Skip"), `#C3C3C3` | [R][S] |
| Primary text | `#FFFFFF`; white at 90 % `#E6FFFFFF`, 80 % `#CCFFFFFF`, 70 % `#B3FFFFFF`; "more" link `#E6E6E6` | [R][S] |
| Light surfaces | `#EAEAEA`, `#E6E6E6`, `#FAFAFA` | [R] |
| Scrim | `#80000000` (50 % black) | [R] |
| Success green | `#5FA53F` | [R] |
| "Love this" rating blue | `#3F54FF` (double-thumb Lottie) | [R] |
| Profile tutorial gradient | `#001A63`, `#0052EB`, `#07142D`, `#120C1F`, `#192247` | [R] |

### Typography
| ID | Fact | Evidence |
| --- | --- | --- |
| M01.1 | Font: **Netflix Sans App** in Regular / Medium / Bold / Black, plus Arabic and Thai subsets. Proprietary, so MythTube must substitute (suggest **Inter** or **Roboto Flex**) | [R] |
| M01.2 | Type sizes in resources: 10, 12, 13, 14, 16, 18, 20 sp (most common: 16 sp and 14 sp) | [R] |

### Spacing and shape
| ID | Fact | Evidence |
| --- | --- | --- |
| M01.3 | Spacing scale (most frequent first): 8, 4, 24, 16, 12, 2, 20, 48, 1, 6, 32, 10, 64, 40, 72, 3, 36, 52, 14 dp | [R] |
| M01.4 | Large sizes seen: 56, 80, 90, 96, 130, 320, 500, 600 dp (cards, sheets, tablet max widths) | [R] |

### Motion
| ID | Fact | Evidence |
| --- | --- | --- |
| M01.5 | Easing: standard `cubic-bezier(0.4,0,0.2,1)`, decelerate `(0,0,0.2,1)`, accelerate `(0.4,0,1,1)`, linear, plus a custom "emphasized" path | [S] |
| M01.6 | Durations (ms): 50, 75, 100, 120, 150, 200, 220, 250, 300, 320, 350, 400, 500, 3000 | [R] |
| M01.7 | Lottie animations: glowing N logo (72², 2.0 s), My List plus→check (24², 0.52 s), play/pause (24², 0.35 s), play-loading-replay (58², 2.9 s), thumb up / thumb down (72², 0.8 s), double-thumb "Love" (72², 1.4 s), remind-me bell→check (48², 1.17 s), remind-me (24², 0.68 s), live-now pulse (48², 2 s), now-playing bars (32², 1.52 s), downloads intro (100², 0.87 s), profile-education tutorial (800×768, 14 s), toggle switch light/dark (12², 1.52 s) | [R] |

---

## M02 — Launch, splash and app shell

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M02.1 | Splash with animated N logo | "Please wait while we start the Netflix application…", glowing-N Lottie | [S][R] |
| M02.2 | Logo for accessibility | "Netflix N logo with a color gradient behind it" | [S] |
| M02.3 | In-app update prompt | "New version of application found. Do you want to update?", "Netflix is updated" | [S] |
| M02.4 | Can't-connect screen | "Can't Connect to Netflix", "Retry", "Check your Network" | [S] |
| M02.5 | Device / region blocks | "This app is not compatible with your device", "Sorry, Netflix hasn't come to this part of the world yet" | [S] |

## M03 — Signed-out landing, sign in and sign up

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M03.1 | Landing marketing carousel | "Unlimited movies, TV shows & more", "Watch anywhere. Cancel anytime.", "There's a plan for every fan", "Ready to watch?", "Watch everywhere", "Recommendations just for you" | [S] |
| M03.2 | Landing top bar | "HELP", "PRIVACY", "SIGN IN" | [S] |
| M03.3 | Primary call to action | "GET STARTED" / "Get Started" | [S] |
| M03.4 | FAQ accordion | "What is Netflix?", "How much does Netflix cost?", "Where can I watch?", "How do I cancel?", "What can I watch on Netflix?", "How does the free trial work?" | [S] |
| M03.5 | Sign In form | "Email or mobile number", "Password", "Show password", "Sign In", "Forgot password?", "Welcome back!" | [S] |
| M03.6 | Sign-in errors | incorrect password, "Sorry, we can't find an account with this email address…" | [S] |
| M03.7 | One-time code login | "Enter the code", "Resend code", "We texted it to …" | [S] |
| M03.8 | Native sign-up flow | plan picker → account → payment, "STEP 1 OF 3", "Create Account", "Finish Sign Up" | [S] |
| M03.9 | Plan selection | Standard with ads / Standard / Premium (plus Basic, Mobile); resolution 480p / 720p / 1080p / 4K+HDR; screens 1 / 2 / 4; "Most Popular" | [S] |
| M03.10 | Payment methods | card, PayPal, UPI AutoPay, carrier billing, direct debit, gift code, Google Play | [S] |
| M03.11 | Restart membership | "Restart Your Membership", "Welcome back, {firstName}!" | [S] |
| M03.12 | Household-sharing education | "Who can watch on your account", Frequently Asked Questions | [S] |

## M04 — Netflix Household and travel

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M04.1 | Not-in-household block | "We don't recognize this device as part of your Netflix Household" | [S] |
| M04.2 | Primary location screens | "Update Primary Location", "I'm Not Home" | [S] |
| M04.3 | Travel access code | "Get a code to watch away from home", "Send an Email" / "Send a Text" | [S] |

## M05 — Profiles

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M05.1 | Profile gate | "Who's Watching?" / "Choose Your Profile"; grid of avatars; "Add Profile"; "Edit" (pencil) | [S] |
| M05.2 | Swipe gestures on the gate | "Swipe left for recommendations. Swipe right for profile section." | [S] |
| M05.3 | Up to 5 profiles | "Every account comes with 5 profiles…" | [S] |
| M05.4 | How Profiles Work tutorial | 14 s blue-gradient Lottie plus 3 bullet points | [S][R] |
| M05.5 | Add / Edit Profile | "Profile Name", "Choose Icon", "Change profile icon", "Make this a kids profile", "Delete Profile" (with confirmation) | [S] |
| M05.6 | Profile Lock (PIN) | "Create Profile Lock", 4-digit PIN, "Forgot PIN?", "Enter your PIN to access this profile.", "{profile}. PIN protected" | [S] |
| M05.7 | Kids profile | "Kids Profile", "Only see kid-friendly TV shows, movies, and games", "KIDS" badge | [S] |
| M05.8 | Maturity ratings | "Maturity Ratings", "ALL MATURITY RATINGS", "{rating} and below" | [S] |
| M05.9 | Blocked titles | "Block Titles", "Edit your blocked titles", search for a title | [S] |
| M05.10 | Playback preferences | "Autoplay Next Episode", "Autoplay Previews" | [S] |
| M05.11 | Language preferences | "Display Language", "Audio & Subtitle Languages" | [S] |
| M05.12 | Subtitle appearance | Text Size (S/M/L), Text Color, Text Edge Style (Depressed / Drop Shadow / Raised / Uniform), Background, Window, Transparency, "Reset to default" | [S] |
| M05.13 | New-profile taste picker | "Now, choose 3 you like", "Personalizing for {name}.", "We're looking for movies and TV shows we think you'll love." | [S] |
| M05.14 | Game handle | "Create your game handle", "Handle not available", example names | [S] |
| M05.15 | Switch Profile sheet | "Switch Profiles", "Switch", "Manage Profiles" | [S] |

## M06 — Bottom navigation

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M06.1 | Home tab | "Home" | [S] |
| M06.2 | New & Hot tab | "New & Hot" | [S] |
| M06.3 | My Netflix tab | "My Netflix" (shows the profile avatar as its icon) | [S][K] |
| M06.4 | Games entry | "Games" / "Browse Games" (separate tab or inside Home — **needs device check**) | [S][K] |
| M06.5 | Clips / Discover vertical feed | "Clips", "Watch Clips", "Discover your next show or movie.", "Next clip", "Previous clip" | [S] |
| M06.6 | Badges | notification and download counts: "Downloads (#)", "Notifications (#)" | [S] |

## M07 — Home

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M07.1 | Top bar | "For {profileName}" (or N logo), Cast icon, Download icon, Search icon | [S][K] |
| M07.2 | Filter chips | "TV Shows", "Movies", "Categories ▾"; × to clear ("Clear filters") | [S] |
| M07.3 | Categories overlay | full-screen list, "All Categories", "Loading Categories", close × | [S] |
| M07.4 | Hero billboard | large poster card, title logo, genre tags, "Play" (white) and "My List" (+) buttons; background tinted to the poster color | [S][K] |
| M07.5 | Billboard badges | "NETFLIX ORIGINAL", "NEW EPISODE", "ALL NEW EPISODES AVAILABLE ON NETFLIX", "Top 10" | [S] |
| M07.6 | Continue Watching row | progress bar, ⓘ and ⋮ buttons → "Episodes & Info", "Remove From Row", "Rate"; "Remove this title from Continue Watching?" | [S] |
| M07.7 | Top 10 row | huge ranking numerals next to posters ("Top 10 TV Shows in {country} Today") | [S][K] |
| M07.8 | Standard poster rows | Trending Now, Only on Netflix, New For You, "More From Shondaland" style rows, "Because you watched …" | [S][K] |
| M07.9 | Games rows on Home | "Mobile Games to Play Now", "More Mobile Games" | [S] |
| M07.10 | My List row | "My List" | [S] |
| M07.11 | Live events row | "Live", "Live events happening now", pulsing live Lottie | [S][R] |
| M07.12 | Surprise title | "Tap to reveal the hidden surprise", "Tada! Your surprise title is {title}" | [S] |
| M07.13 | Long-press / ⓘ preview sheet | bottom sheet with poster, meta, Play, Download, Preview, Share, "Episodes & Info" | [S][K] |
| M07.14 | Pull to refresh | "Refreshing..." | [S] |
| M07.15 | Autoplay previews | muted preview in billboard / preview sheet; "Audio on" / "Audio off" | [S] |
| M07.16 | Scroll behavior | header turns from transparent to blurred/dark; chips collapse when scrolling down | [K] |

## M08 — Title details page

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M08.1 | Media header | trailer autoplay or artwork, mute toggle, back (×), Cast | [S][K] |
| M08.2 | Title and meta line | year, maturity badge, seasons/runtime, quality tags (HD, 4K, HDR, HDR10+, Dolby Vision, Dolby Atmos, 5.1, Spatial Audio, AD, SDH/CC) | [S][R] |
| M08.3 | Top-10 rank line | "#2 in TV Shows Today" | [K] |
| M08.4 | Primary buttons | "Play" / "Resume {title}" / "Play S1:E1" (white), "Download" / "Download S1:E1" (gray) | [S] |
| M08.5 | Synopsis | "Expand synopsis" / "read more" | [S] |
| M08.6 | Credits | "Starring: … more", "Director:", "Creators:" | [S] |
| M08.7 | Action row | "My List" (plus→check Lottie), "Rate" (3 thumbs), "Share", "Remind Me" (for upcoming titles) | [S][R] |
| M08.8 | Rating picker | "Not for me", "I like this", "Love this!" (+ remove rating), feedback toast "You'll see more like this." | [S][R] |
| M08.9 | Tabs | "Episodes", "Collection", "More Like This", "Trailers & More" | [S] |
| M08.10 | Season picker | "Season {n}" dropdown sheet | [S] |
| M08.11 | Episode rows | thumbnail with play icon, "1. Title", runtime, synopsis, download button with states | [S] |
| M08.12 | More Details page | Cast, Director, Writers, Genres, "This show is: [moods]", Maturity Rating | [S] |
| M08.13 | Availability notice | "This series is available until …" | [S] |
| M08.14 | Live / record | "Watch Live", "Record", "Recording scheduled" | [S] |
| M08.15 | Content warning | "Content Warning", age verification | [S] |
| M08.16 | Rewatch | "Rewatch Series", "Rewatch {title}" | [S] |

## M09 — Video player

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M09.1 | Landscape full-screen player | `PlayerActivity` | [M] |
| M09.2 | Top bar | back, title ("{show} S1:E2 "Episode"), Cast, report-a-problem flag | [S] |
| M09.3 | Center controls | rewind 10 s, play/pause (Lottie), forward 10 s; double-tap seeking ("-10" / "+10") | [S][R] |
| M09.4 | Seek bar | "{elapsed} of {total}", time remaining, thumbnail scrubbing | [S][K] |
| M09.5 | Bottom bar | "Speed (1x)", "Lock", "Episodes", "Audio & Subtitles", "Next Ep." | [S] |
| M09.6 | Speed sheet | 0.5x, 0.75x, 1x (Normal), 1.25x, 1.5x | [S] |
| M09.7 | Screen lock | "Screen Locked", "Tap to Unlock", "Unlock controls?" | [S] |
| M09.8 | Skip buttons | "Skip Intro", "Skip Recap" | [S] |
| M09.9 | Next episode | "Next Episode", countdown "Play in %1$d", "Watch Credits", "Up next" | [S] |
| M09.10 | Still watching? | "Are you still there?", "Continue watching" / "Stop watching" | [S] |
| M09.11 | Audio & Subtitles sheet | audio track list, subtitle list, "(CC)", "Off" | [S] |
| M09.12 | Episodes sheet | season picker plus episode list inside the player | [S] |
| M09.13 | Pinch zoom | "Zoom in", "Zoom out" | [S] |
| M09.14 | Picture-in-Picture | "Allow Picture-in-picture" | [S] |
| M09.15 | Moments | "Clip a Moment" from the player, "Share Moment" | [S] |
| M09.16 | Chapters | "Chapters", "{startTime} • {chapterTitle}" | [S] |
| M09.17 | Ads in player | "Ad 1 of 2 • 0:15", "{title} resumes after ads" | [S] |
| M09.18 | Live player | "You're watching live", real-time voting, "Exit Livestream" | [S] |
| M09.19 | Errors | "There is a problem playing the video", "Too many people are using your account right now" | [S] |

## M10 — Search

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M10.1 | Search field | "Search shows, movies, games…", voice search mic, "Clear search" | [S] |
| M10.2 | Empty-state suggestions | "Recommended TV Shows & Movies" list (wide thumbnail, title, play icon) | [K] |
| M10.3 | Results | poster grid ("Movies & TV"), "Mobile Games" section | [S][K] |
| M10.4 | No results | "Oh darn. We don't have that.", "Try searching for another movie, show, actor, director, or genre." | [S] |

## M11 — New & Hot

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M11.1 | Sticky category chips | "Coming Soon", "Everyone's Watching", "Top 10 TV Shows", "Top 10 Movies" (+ "Live", "Podcasts" where available) | [S][K] |
| M11.2 | Coming Soon item | date column (month + day), wide trailer card, "Remind Me" (bell→check Lottie), "Info", synopsis, genre tags | [S][R] |
| M11.3 | Everyone's Watching item | "Share", "My List", "Play" | [S][K] |
| M11.4 | Top 10 list | numbered items with rank | [K] |
| M11.5 | Reminder toast | "Reminder set. Look for this in My List soon." | [S] |

## M12 — My Netflix

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M12.1 | Profile header | avatar plus name ▾ (opens Switch Profile sheet) | [K] |
| M12.2 | Top-right actions | Cast, Search, menu ☰ | [K] |
| M12.3 | Notifications row | list of new-release alerts, "No notifications" | [S] |
| M12.4 | Downloads row | shortcut into Downloads | [S] |
| M12.5 | "TV Shows & Movies You've Liked" row | horizontal posters with Share button | [K] |
| M12.6 | My List row + "See All" | | [S] |
| M12.7 | "Trailers You've Watched" row | | [K] |
| M12.8 | "Moments You've Saved" | rewatch / share / edit / remove moments; empty state "You don't have any moments saved" | [S] |
| M12.9 | Games you've played | | [K] |
| M12.10 | Menu sheet | Manage Profiles, App Settings, Account, Help, Sign Out | [S] |

## M13 — My List page

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M13.1 | Filters | TV Shows, Movies, Started, Haven't started, "Clear All" | [S] |
| M13.2 | Sort | Suggested, Date Added to List, Release Date, A - Z | [S] |
| M13.3 | Edit list | delete with "Undo" | [S] |
| M13.4 | Empty states | "Your list is empty", "Nothing here… yet", "FIND SOMETHING TO WATCH" | [S] |
| M13.5 | Games list | "Keep track of games to play" | [S] |

## M14 — Downloads

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M14.1 | My Downloads page | grouped by show, size line ("{certification} \| 3 Episodes \| 1.2 GB"), storage bar ("Used • Netflix • Free") | [S] |
| M14.2 | Download states | Downloading x %, Paused, Waiting for Wi-Fi, Downloaded, Error, Expired, Renew | [S] |
| M14.3 | Edit mode | select and delete | [S] |
| M14.4 | Smart Downloads | auto-download the next episode and delete watched ones; explainer page | [S] |
| M14.5 | Downloads for You | allocate storage (GB slider), "Turn on Downloads for You" | [S] |
| M14.6 | Empty state | "Movies and TV shows that you download appear here.", "See what you can download" | [S] |
| M14.7 | Limits / errors | 15 downloads/month, device limit, licensing limits, "Not Enough Storage" | [S] |
| M14.8 | Download settings | Wi-Fi only, Video Quality (Standard / High), Location (Internal / SD Card), "Delete All Downloads" | [S] |
| M14.9 | Offline playback | "Ready to Play", partially downloaded playback | [S] |

## M15 — Clips and Moments

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M15.1 | Vertical clips feed | "Clips", "Watch Clips", next/previous clip, "More details for {title}", "Share {title}" | [S] |
| M15.2 | Save a Moment | "Clip a Moment", "Saved in My Netflix", "Replay Moment", "Keep Watching" | [S] |
| M15.3 | Share a Moment | "Check out this moment from {title}, starting at {timestamp}." | [S] |

## M16 — Games

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M16.1 | Games browse | "Mobile Games to Play Now", featured game, categories | [S] |
| M16.2 | Game details | screenshot carousel, trailer (mute/play), Rating, Developer, Category, Modes, Players, Compatibility, Internet Required, Controller Support, Languages, Release Year, Version | [S] |
| M16.3 | Get / Play | "Get Game", "Play Game", "Installed", "Downloading game…" | [S] |
| M16.4 | Game types | Mobile Game, TV Game, Web Game, TV & Web Game | [S] |
| M16.5 | Phone as TV controller | "Scan the QR code and join" (camera), "Netflix Game Controller" | [S] |
| M16.6 | Leaderboards and social | game handle, "Climb the leaderboards", invites | [S] |
| M16.7 | "Puzzled" daily puzzle game | streaks, daily notifications | [S] |
| M16.8 | Home-screen shortcut | "Add a shortcut to access this game faster" | [S] |

## M17 — Cast to TV

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M17.1 | Cast picker | "Cast to", "Looking for devices...", device list, "No devices found" | [S] |
| M17.2 | Mini controller | "Now Playing", rewind/forward 10 s, CC, volume slider, "Stop casting" | [S][R] |
| M17.3 | Local-network permission prompt | | [S] |

## M18 — Live events

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M18.1 | Live badge and rows | "Live", "Watch live", pulsing Lottie | [S][R] |
| M18.2 | Real-time voting | "Tap again to submit", "Your Vote Has Been Submitted!" | [S] |
| M18.3 | Ended state | "Livestream has ended", "Previously streamed live" | [S] |

## M19 — Notifications and reminders

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M19.1 | Permission prompt | "Allow Notifications?", "Never miss a moment", "Don't Allow" | [S] |
| M19.2 | Push types | new episode, reminder, download complete, game | [S] |
| M19.3 | In-app notification list | inside My Netflix | [S] |

## M20 — App Settings

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M20.1 | Video Playback | Cellular Data Usage: Automatic / Wi-Fi Only / Save Data / Maximum Data | [S] |
| M20.2 | Notifications toggle | | [S] |
| M20.3 | Downloads | Wi-Fi only, Smart Downloads, Video Quality, Location | [S] |
| M20.4 | Diagnostics | Internet Speed Test, Check Network, Playback Specification | [S] |
| M20.5 | Privacy | Cookie Preferences, "Don't Sell/Share My Personal Info", Ad Choices | [S] |
| M20.6 | About | Version, Open Source Licenses, Privacy Statement, Terms of Use | [S] |
| M20.7 | Sign Out | with confirmation | [S] |

## M21 — Account and billing

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M21.1 | Change plan | "Change Plan", "Upgrade Plan" | [S] |
| M21.2 | Payment methods / gift codes | "Redeem a gift card or special offer code" | [S] |
| M21.3 | Screen limit and upgrade | "Screen Limit", "UPGRADE TO 2 SCREENS" | [S] |
| M21.4 | Price-change consent | | [S] |

## M22 — Help and customer support

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M22.1 | Help menu | Help Center, Fix a Connection Issue, Update Password, Request a Title | [S] |
| M22.2 | In-app voice call / chat with dialpad | "Call Now", "Chat Now" | [S] |
| M22.3 | Report a Problem | audio / video / subtitles / buffering / inappropriate content checklist, "Thanks! We're on it." | [S] |

## M23 — Ads tier

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M23.1 | Ad breaks in the player | | [S] |
| M23.2 | Ad feedback | "The ad is not relevant to me" | [S] |
| M23.3 | "Only available on ad-free plans" locks | | [S] |

## M24 — Kids experience

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M24.1 | Kids area | own catalog, big colorful images, "KIDS" entry | [S] |
| M24.2 | Kids-only device mode | "This device is set up for kids" | [S] |

## M25 — System states, errors, accessibility

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M25.1 | Network errors, retry screens, toasts, snackbars with Undo | | [S] |
| M25.2 | Bottom sheets with drag handle | "Expand halfway", "Dismiss bottom sheet" | [S] |
| M25.3 | Full screen-reader labels for every control | | [S] |
| M25.4 | Share sheet | Copy Link, Instagram Stories, Save Image, "Share via" | [S] |

## M26 — Internal debug / QA menu

| ID | Feature | Netflix labels / behavior | Evidence |
| --- | --- | --- | --- |
| M26.1 | Debug menu | "Open Debug Menu", Force Widevine L3, Bootloader parameters, Bug Report | [S] |

---

## Suggested starting point (you decide)

| Keep as working UI with mock data | Keep as visual-only (taps show a toast or are disabled) | Suggest removing |
| --- | --- | --- |
| M01, M02, M05 (except M05.14), M06, M07, M08, M09 (except M09.14, M09.17, M09.18), M10, M11, M12, M13, M14 (fake states), M15.1, M25 | M03.1–M03.7 (mock login), M16.1–M16.3, M17.1, M19.3, M20 | M03.8–M03.12, M04, M05.14, M09.14, M09.17, M09.18, M15.2–M15.3, M16.4–M16.8, M17.2–M17.3, M18, M21, M22.2, M23, M24.2, M26 |

## Branding swap for MythTube

| Netflix | MythTube |
| --- | --- |
| Name "Netflix", "Netflix Original", "Only on Netflix" | "MythTube", "MythTube Original", "Only on MythTube" |
| N ribbon logo / glowing-N Lottie | new "M" ribbon logo (original artwork) |
| Netflix Sans | Inter (open-source) |
| Netflix artwork / trailers | mock posters + open sample videos |
| Red `#E50914` | same red, or a slight variant if you want distance from the brand |

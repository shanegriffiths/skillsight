# README hero: the 60-second dashboard tour.
#
# Regenerate from the repo root:
#   brew install vhs        # needs ttyd + ffmpeg, brew pulls both in
#   vhs .github/demo/hero.tape
#
# Runs the published package (`npx skillsight --demo`) against the built-in
# fictional dataset, so the output is deterministic and nothing real is read.
# "Liga SFMono Nerd Font" must be installed for the folder/branch glyphs.
#
# Geometry is deliberate: 1800px wide, embedded with <img width="900"> in the
# README, gives an exact 2:1 mapping on retina displays (crisp text). Keep
# LineHeight at the default 1.0 — xterm.js stretches block/box glyphs (the
# logo, borders) to fill taller cells, which distorts them.

Output .github/demo/hero.gif
Output .github/demo/hero.mp4

Require npx

Set Shell "bash"
Set FontFamily "Liga SFMono Nerd Font"
Set FontSize 17
Set Width 1800
Set Height 1040
Set Padding 16
Set WindowBar Colorful
Set Framerate 24
Set TypingSpeed 55ms

# Hidden setup: a stable demo-home path, and a warm npx cache so the visible
# launch is instant.
Hide
Type "export TMPDIR=/tmp && npx -y skillsight --help"
Enter
Wait+Screen@120s /--demo/
Type "clear"
Enter
Sleep 500ms
Show

# Launch
Type "npx skillsight --demo"
Sleep 500ms
Enter
Wait+Screen@30s /Leaderboard/
Sleep 3s

# Open the first project: what it adds on top of the global layer
Enter
Sleep 2s

# Walk down its items to the inherited global layer, and expand it
Down
Sleep 500ms
Down
Sleep 500ms
Down
Sleep 500ms
Enter
Sleep 3s

# Open a shared skill: provenance, used-by, and the agent handoff line
Down
Sleep 400ms
Down
Sleep 400ms
Enter
Sleep 4s
Escape
Sleep 800ms

# The other tabs
Type "2"
Sleep 2.5s
Type "3"
Sleep 2.5s
Type "4"
Sleep 3.5s

# Live filter
Type "/"
Sleep 600ms
Type@200ms "sen"
Sleep 2.5s
Escape
Sleep 600ms

# Back home
Type "1"
Sleep 3s

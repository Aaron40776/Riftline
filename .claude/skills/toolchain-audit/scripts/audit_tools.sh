#!/usr/bin/env bash
# Read-only inventory of creative / game-dev tooling on this machine.
# Installs nothing, writes nothing. Usage:
#   audit_tools.sh            # all groups
#   audit_tools.sh audio 3d   # only these groups (core 3d image audio web engines build gpu python)
# Output lines: STATUS<TAB>group<TAB>tool<TAB>version-or-path
# STATUS is OK (found and answered a version probe), FOUND (on PATH, no version), MISSING.

set -u
groups=("$@")
want() { [ ${#groups[@]} -eq 0 ] && return 0; local g; for g in "${groups[@]}"; do [ "$g" = "$1" ] && return 0; done; return 1; }

row() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4"; }

# probe GROUP NAME [version-args...]; first line of version output is reported
probe() {
  local group=$1 name=$2; shift 2
  local path; path=$(command -v "$name" 2>/dev/null)
  if [ -z "$path" ]; then row MISSING "$group" "$name" "-"; return; fi
  if [ $# -eq 0 ]; then row FOUND "$group" "$name" "$path"; return; fi
  local v; v=$(timeout 10 "$path" "$@" 2>&1 | grep -m1 -v -e '^\s*$' -e '^Picked up' | cut -c1-90)
  if [ -n "$v" ]; then row OK "$group" "$name" "$v"; else row FOUND "$group" "$name" "$path"; fi
}

pymod() { # group module
  local v
  if v=$(python3 -c "import $2 as m; print(getattr(m,'__version__','present'))" 2>/dev/null); then row OK "$1" "py:$2" "$v"
  else row MISSING "$1" "py:$2" "-"; fi
}

blender_bin() {
  if [ -n "${BLENDER_BIN:-}" ] && [ -x "$BLENDER_BIN" ]; then echo "$BLENDER_BIN"; return; fi
  command -v blender 2>/dev/null && return
  local c
  for c in /Applications/Blender.app/Contents/MacOS/Blender /opt/blender*/blender "$HOME"/blender*/blender \
           "$HOME"/opt/blender*/blender /snap/bin/blender "/c/Program Files/Blender Foundation"/Blender*/blender.exe; do
    [ -x "$c" ] && { echo "$c"; return; }
  done
}

echo "# host: $(uname -srm) | shell: ${SHELL:-?} | home: $HOME | date: $(date -u +%FT%TZ)"
command -v claude >/dev/null && echo "# claude code: $(claude --version 2>/dev/null)"

if want core; then
  probe core git --version; probe core node --version; probe core npm --version; probe core python3 --version
  probe core pip3 --version; probe core rg --version; probe core jq --version; probe core docker --version
  probe core cargo --version; probe core go version; probe core java -version; probe core dotnet --version
fi
if want 3d; then
  b=$(blender_bin)
  if [ -n "$b" ]; then row OK 3d blender "$("$b" --version 2>/dev/null | head -1) ($b)"; else row MISSING 3d blender "- (set BLENDER_BIN if installed elsewhere)"; fi
  probe 3d gltf-transform --version; probe 3d gltfpack -v; probe 3d gltf_validator --version
  probe 3d toktx --version; probe 3d basisu -version; probe 3d draco_encoder -h
  pymod 3d trimesh; pymod 3d pygltflib; pymod 3d bpy
fi
if want image; then
  probe image magick -version; probe image convert -version; probe image identify -version
  probe image gimp --version; probe image inkscape --version; probe image krita --version
  probe image optipng -v; probe image pngquant --version; probe image oxipng --version
  probe image cwebp -version; probe image avifenc --version; probe image exiftool -ver
  pymod image PIL; pymod image numpy; pymod image cv2; pymod image skimage; pymod image matplotlib
fi
if want audio; then
  probe audio ffmpeg -version; probe audio ffprobe -version; probe audio sox --version
  probe audio lame --version; probe audio oggenc --version; probe audio opusenc --version
  probe audio fluidsynth --version; probe audio timidity --version; probe audio csound --version
  probe audio lilypond --version; probe audio musescore --version; probe audio mscore --version
  probe audio audacity --version; probe audio reaper -v
  pymod audio numpy; pymod audio scipy; pymod audio soundfile; pymod audio librosa; pymod audio pyloudnorm; pymod audio mido
  if command -v ffmpeg >/dev/null; then
    for enc in libvorbis libopus libmp3lame aac flac; do
      ffmpeg -hide_banner -encoders 2>/dev/null | grep -qw "$enc" && row OK audio "ffmpeg-enc:$enc" yes || row MISSING audio "ffmpeg-enc:$enc" "-"
    done
    for f in loudnorm ebur128 astats afir; do
      ffmpeg -hide_banner -filters 2>/dev/null | grep -qw "$f" && row OK audio "ffmpeg-filter:$f" yes || row MISSING audio "ffmpeg-filter:$f" "-"
    done
  fi
fi
if want web; then
  probe web playwright --version; probe web npx --version; probe web pnpm --version; probe web yarn --version
  probe web serve --version; probe web http-server --version; probe web eslint --version; probe web prettier --version
  probe web tsc --version; probe web chromium --version; probe web google-chrome --version; probe web firefox --version
  probe web xvfb-run --help
  for d in "${PLAYWRIGHT_BROWSERS_PATH:-}" "$HOME/.cache/ms-playwright" "$HOME/Library/Caches/ms-playwright"; do
    [ -n "$d" ] && [ -d "$d" ] && row OK web playwright-browsers "$(ls "$d" | tr '\n' ' ')($d)"
  done
fi
if want engines; then
  probe engines godot --version; probe engines godot4 --version; probe engines unity-editor -version
  probe engines Unity -version; probe engines defold --version; probe engines love --version
  probe engines emcc --version; probe engines wasm-pack --version
fi
if want gpu; then
  probe gpu nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
  probe gpu glxinfo -B; probe gpu vulkaninfo --summary
  [ -e /dev/dri ] && row OK gpu /dev/dri "$(ls /dev/dri | tr '\n' ' ')" || row MISSING gpu /dev/dri "- (no DRM device: expect software GL / SwiftShader in headless browsers)"
fi
echo "# not detectable from a shell: MCP servers, connectors, plugins and skills -> use the agent's own tool list / ToolSearch / ListSkills"

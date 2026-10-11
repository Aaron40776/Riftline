#!/usr/bin/env bash
# Encode WAV masters into web/game delivery formats with ffmpeg. Never overwrites the input.
#   encode_for_web.sh [-o OUTDIR] [-f ogg,m4a,mp3,opus] [-m] [-r 44100|48000] [-q low|mid|high] FILE.wav...
#   -m  downmix to mono (most SFX: smaller, and 3D panners want mono sources anyway)
# Formats: ogg = Vorbis (.ogg), opus = Opus in .webm, m4a = AAC-LC, mp3 = LAME VBR.
# Browser support changes: check current tables (caniuse.com) for the target devices; AAC (.m4a) and MP3
# play in all current major browsers, and are the safe fallback for older iOS/Safari.
# Loops: Vorbis/Opus decode gaplessly in WebAudio decodeAudioData; MP3/AAC add encoder padding at the start
# (and MP3 at the end) that clicks in a loop: prefer ogg/opus for loops, or trim/loop-point in code.
set -euo pipefail
out=web-audio; fmts=ogg,m4a; mono=0; rate=""; q=mid
while getopts "o:f:mr:q:" o; do case $o in
  o) out=$OPTARG;; f) fmts=$OPTARG;; m) mono=1;; r) rate=$OPTARG;; q) q=$OPTARG;;
  *) sed -n '2,10p' "$0"; exit 2;; esac; done
shift $((OPTIND - 1))
[ $# -gt 0 ] || { sed -n '2,10p' "$0"; exit 2; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found (toolchain-audit)"; exit 3; }
case $q in low) vq=2 aac=64k mp3=7 opus=48k;; high) vq=6 aac=160k mp3=2 opus=128k;; *) vq=4 aac=96k mp3=4 opus=80k;; esac
[ $mono = 1 ] && { aac=${aac%k}; aac=$((aac / 2 + 16))k; opus=${opus%k}; opus=$((opus / 2 + 8))k; }
mkdir -p "$out"
for f in "$@"; do
  base=$(basename "${f%.*}")
  common=(-hide_banner -loglevel error -y -i "$f" -map_metadata -1)
  [ $mono = 1 ] && common+=(-ac 1)
  [ -n "$rate" ] && common+=(-ar "$rate")
  IFS=, read -ra list <<< "$fmts"
  for fm in "${list[@]}"; do
    case $fm in
      ogg)  dst="$out/$base.ogg";  ffmpeg "${common[@]}" -c:a libvorbis -q:a $vq "$dst";;
      m4a)  dst="$out/$base.m4a";  ffmpeg "${common[@]}" -c:a aac -b:a $aac -movflags +faststart "$dst";;
      mp3)  dst="$out/$base.mp3";  ffmpeg "${common[@]}" -c:a libmp3lame -q:a $mp3 "$dst";;
      opus) dst="$out/$base.webm"; ffmpeg "${common[@]}" -c:a libopus -b:a $opus -ar 48000 "$dst";;
      *) echo "unknown format $fm"; exit 2;;
    esac
    [ "$(realpath "$dst")" = "$(realpath "$f")" ] && { echo "refusing to overwrite input"; exit 4; }
    printf '%-40s %8d bytes\n' "$dst" "$(stat -c %s "$dst" 2>/dev/null || stat -f %z "$dst")"
  done
done

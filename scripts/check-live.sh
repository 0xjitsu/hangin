#!/usr/bin/env bash
# Verify a deployed Hangin URL: head tags, assets (200 + content-type), preview video, player page.
# Usage: scripts/check-live.sh https://hangin-ph.vercel.app
set -u
BASE="${1:-}"
[ -z "$BASE" ] && { echo "usage: $0 <url>" >&2; exit 2; }
BASE="${BASE%/}"
fails=0
fail() { echo "FAIL: $*"; fails=$((fails + 1)); }
ok() { echo "ok:   $*"; }

html="$(curl -fsSL "$BASE/")" || { echo "FAIL: cannot fetch $BASE/"; exit 1; }
flat="$(printf '%s' "$html" | tr '\n\r\t' '   ')"   # tags may span lines

# meta_content <attr> <name>: content of the <meta> whose property/name equals <name>
meta_content() {
  printf '%s' "$flat" | grep -oE '<meta[^>]*>' | grep -E "(property|name)=\"$1\"" | head -1 \
    | sed -nE 's/.*content="([^"]*)".*/\1/p'
}
for k in og:video og:video:secure_url og:video:type og:video:width og:video:height og:image og:title og:description \
         twitter:card twitter:player twitter:player:width twitter:player:height; do
  v="$(meta_content "$k")"
  if [ -z "$v" ]; then fail "meta $k missing"; continue; fi
  case "$k" in
    og:video|og:video:secure_url|og:image|twitter:player)
      case "$v" in https://*) ok "$k = $v" ;; *) fail "$k is not an absolute https URL: $v" ;; esac ;;
    *) ok "$k = $v" ;;
  esac
done
[ "$(meta_content og:video:type)" = "video/mp4" ] || fail "og:video:type must be video/mp4"
[ "$(meta_content twitter:card)" = "player" ] || fail "twitter:card must be player"

# check_url <url> <content-type regex> [max-bytes]
check_url() {
  local url="$1" want="$2" max="${3:-}" tmp code ctype size
  tmp="$(mktemp)"
  read -r code ctype size < <(curl -sSL -o "$tmp" -w '%{http_code} %{content_type} %{size_download}\n' "$url") || { fail "$url unreachable"; rm -f "$tmp"; return; }
  rm -f "$tmp"
  [ "$code" = "200" ] || { fail "$url returned $code"; return; }
  printf '%s' "$ctype" | grep -qiE "$want" || { fail "$url content-type '$ctype' does not match $want"; return; }
  if [ -n "$max" ] && [ "$size" -ge "$max" ]; then fail "$url is $size bytes (limit $max)"; return; fi
  ok "$url 200 $ctype ${size}B"
}

# Tag URLs point at production; check the same paths on the URL under test (identical when BASE is production).
on_base() { printf '%s' "$1" | sed -E "s|^https://[^/]+|$BASE|"; }
# Media types the og/twitter tags point at
check_url "$(on_base "$(meta_content og:video)")" '^video/mp4' 5242880
check_url "$(on_base "$(meta_content og:video:secure_url)")" '^video/mp4' 5242880
check_url "$(on_base "$(meta_content og:image)")" '^image/png'
check_url "$(on_base "$(meta_content twitter:player)")" '^text/html'
check_url "$BASE/og/player.html" '^text/html'
check_url "$BASE/og/preview.mp4" '^video/mp4' 5242880

# Every asset referenced from the HTML and from the JS/CSS it loads
assets="$(printf '%s' "$flat" | grep -oE '(src|href)="/[^"]+"' | sed -E 's/^(src|href)="//; s/"$//' | sort -u)"
queue="$assets"
seen=""
while [ -n "$queue" ]; do
  next=""
  for a in $queue; do
    case " $seen " in *" $a "*) continue ;; esac
    seen="$seen $a"
    case "$a" in
      *.js) ct='javascript' ;; *.css) ct='^text/css' ;; *.svg) ct='^image/svg' ;; *.png) ct='^image/png' ;;
      *.mp4) ct='^video/mp4' ;; *.json) ct='json' ;; *.woff2) ct='woff2|font' ;; *.woff) ct='woff|font' ;; *.html|/) ct='^text/html' ;; *) ct='.' ;;
    esac
    check_url "$BASE$a" "$ct"
    case "$a" in
      *.js|*.css)
        body="$(curl -fsSL "$BASE$a" 2>/dev/null || true)"
        refs="$(printf '%s' "$body" | grep -oE '["'"'"'(]/?(assets/)?[A-Za-z0-9_.-]+\.(js|css|woff2?|png|svg|mp4|json|wasm)' | sed -E 's/^["'"'"'(]//' | grep -E '^/?assets/' | sed -E 's|^/?|/|' | sort -u)"
        next="$next $refs" ;;
    esac
  done
  queue="$next"
done

if [ "$fails" -gt 0 ]; then echo "check-live: $fails failure(s)"; exit 1; fi
echo "check-live: all checks passed for $BASE"

#!/usr/bin/env bash
# Regression tests for skills/merge-request/scripts/check-title.sh.
# Run: bash tests/check-title.test.sh
set -uo pipefail

CHECK="$(cd "$(dirname "$0")/.." && pwd)/skills/merge-request/scripts/check-title.sh"
RELEASE_RE='^([A-Z]+-\d+\s)?(feat|build|ci|chore|deps|docs?|fix|perf|refactor)(\(\w+\))?:\s'
failed=0

expect() { # expect ok|fail "<title>" ["<release regex>"]
  local want="$1" title="$2"; shift 2
  if bash "$CHECK" "$title" "$@" >/dev/null; then got=ok; else got=fail; fi
  if [ "$got" != "$want" ]; then
    echo "FAIL: expected $want, got $got: $title"
    failed=1
  fi
}

# Valid
expect ok "SHOP-412 fix: [Cart] Дата доставки в итоге заказа"
expect ok "SHOP-412 SHOP-415 fix: [Cart] Дата доставки и иконки в подсказке"
expect ok "fix: [UI] Перенос длинных названий в подсказке"
expect ok "feat: Новый компонент без скоупа"
expect ok "Draft: SHOP-77 fix: [Cart] Окно доставки до 00:00"
expect ok "SHOP-1 fix: [Cart] X" "$RELEASE_RE"

# Cyrillic summary of 79 chars passes even in the C locale (bytes ≠ characters)
LC_ALL=C expect ok "fix: [UI] $(printf 'Я%.0s' $(seq 1 79))"

# Invalid
expect fail "SHOP-1 fix(cart): scope in parentheses"
expect fail "SHOP-1 feat!: breaking marker"
expect fail "SHOP-1, SHOP-2: commas and no type"
expect fail "SHOP-1: no type"
expect fail "Wrap long item names in hint"
expect fail "fix: [UI] Trailing period."
expect fail "fix: [UI] $(printf 'Я%.0s' $(seq 1 81))"
expect fail "SHOP-1 SHOP-2 fix: [Cart] Two keys break the release regex" "$RELEASE_RE"
expect fail "SHOP-1 fix: [cart] Scope in lowercase"
expect fail "SHOP-1 fix: [Cart] summary in lowercase"
expect fail "feat: новый компонент без скоупа"
LC_ALL=C expect fail "fix: [Корзина] дата доставки"
LC_ALL=C expect ok "fix: [Корзина] Дата доставки"

[ $failed -eq 0 ] && echo "OK: check-title tests passed"
exit $failed

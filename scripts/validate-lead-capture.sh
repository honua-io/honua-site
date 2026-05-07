#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
index_file="${repo_root}/index.html"
analytics_file="${repo_root}/assets/analytics.js"
headers_file="${repo_root}/_headers"
handoff_doc="${repo_root}/docs/lead-capture-handoff.md"
workflow_file="${repo_root}/.github/workflows/pages.yml"
form_action="https://formsubmit.co/mike@honua.io"

lead_fields=(
  "lead_landing_page"
  "lead_current_page"
  "lead_referrer"
  "lead_utm_source"
  "lead_utm_medium"
  "lead_utm_campaign"
  "lead_utm_term"
  "lead_utm_content"
  "lead_cta_label"
  "lead_cta_page"
  "lead_cta_href"
)

fail() {
  local message="$1"
  echo "Validation failed: ${message}" >&2
  exit 1
}

require_file() {
  local file="$1"
  [[ -f "${file}" ]] || fail "missing required file ${file}"
}

require_fixed() {
  local needle="$1"
  local file="$2"
  grep -Fq "${needle}" "${file}" || fail "expected '${needle}' in ${file}"
}

require_match() {
  local pattern="$1"
  local file="$2"
  grep -Eq "${pattern}" "${file}" || fail "expected pattern '${pattern}' in ${file}"
}

require_no_match() {
  local pattern="$1"
  local file="$2"
  if grep -Eq "${pattern}" "${file}"; then
    fail "unexpected pattern '${pattern}' in ${file}"
  fi
}

require_file "${index_file}"
require_file "${analytics_file}"
require_file "${headers_file}"
require_file "${handoff_doc}"
require_file "${workflow_file}"

form_tag="$(perl -0ne 'if (/(<form\b[^>]*data-contact-form[^>]*>)/s) { print $1; exit }' "${index_file}")"
[[ -n "${form_tag}" ]] || fail "contact form is missing data-contact-form"

case "${form_tag}" in
  *"action=\"${form_action}\""*) ;;
  *) fail "contact form action must stay ${form_action}" ;;
esac

case "${form_tag}" in
  *'method="POST"'*) ;;
  *) fail "contact form must submit with method=\"POST\"" ;;
esac

case "${form_tag}" in
  *'data-analytics-event="lead_form_submit"'*) ;;
  *) fail "contact form must emit lead_form_submit" ;;
esac

case "${form_tag}" in
  *'data-analytics-destination="formsubmit"'*) ;;
  *) fail "contact form must identify the FormSubmit destination" ;;
esac

for field in "${lead_fields[@]}"; do
  require_match "<input[^>]*(name=\"${field}\"[^>]*type=\"hidden\"|type=\"hidden\"[^>]*name=\"${field}\")" "${index_file}"
  require_fixed "\"${field}\"" "${analytics_file}"
  require_fixed "\`${field}\`" "${handoff_doc}"
done

require_fixed "sendAnalyticsEvent(form.dataset.analyticsEvent || \"lead_form_submit\"" "${analytics_file}"
require_fixed "page_location: currentPage()" "${analytics_file}"
require_fixed "transport_type: \"beacon\"" "${analytics_file}"
require_fixed "if (!hasAnalyticsConsent())" "${analytics_file}"
require_fixed "clearContactAttribution(form)" "${analytics_file}"

require_no_match "form\\.elements\\.(name|email|company|message)|lead_(name|email|company|message)|\\b(name|email|company|message)[[:space:]]*:" "${analytics_file}"

require_match "Content-Security-Policy: .*form-action 'self' https://formsubmit\\.co" "${headers_file}"
require_match "content=\".*form-action 'self' https://formsubmit\\.co" "${index_file}"
require_fixed "${form_action}" "${handoff_doc}"
require_fixed "Failed lead sync alerting" "${handoff_doc}"
require_fixed "CRM field mapping/import" "${handoff_doc}"
require_fixed "./scripts/validate-lead-capture.sh" "${workflow_file}"

perl -0ne '
  my $file = $ARGV;
  my $html = $_;
  while ($html =~ /<a\b[^>]*>/sg) {
    my $tag = $&;
    my $start = $-[0];
    my ($href) = $tag =~ /\bhref="([^"]+)"/;
    next unless defined $href;
    next unless $href =~ /^(?:index\.html#contact|#contact|docs\.html#quickstart|#quickstart|pricing\.html)$/;
    my ($class) = $tag =~ /\bclass="([^"]*)"/;
    next unless defined $class && $class =~ /(?:^|\s)(?:button|nav-utility)(?:\s|$)/;

    my $expected_destination = $href;
    $expected_destination = "index.html#contact" if $href eq "#contact";
    $expected_destination = "docs.html#quickstart" if $href eq "#quickstart";

    my @missing;
    push @missing, "data-analytics-event=\"cta_click\"" unless $tag =~ /\bdata-analytics-event="cta_click"/;
    push @missing, "data-analytics-label" unless $tag =~ /\bdata-analytics-label="[^"]+"/;
    push @missing, "data-analytics-destination=\"${expected_destination}\"" unless $tag =~ /\bdata-analytics-destination="\Q$expected_destination\E"/;

    if (@missing) {
      my $prefix = substr($html, 0, $start);
      my $line = 1 + ($prefix =~ tr/\n//);
      print STDERR "Validation failed: ${file}:${line} buyer-path CTA missing " . join(", ", @missing) . "\n";
      exit 1;
    }
  }
' "${repo_root}"/*.html

echo "Lead capture validation passed."

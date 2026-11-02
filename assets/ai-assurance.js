// A cached page must not imply that its assessment is still within review date.
const due = document.getElementById('ai-review-due');
const status = document.getElementById('ai-review-status');
if (due && status && Date.now() > Date.parse(`${due.dateTime}T23:59:59Z`)) {
  status.textContent = 'Review overdue. This is a historical assessment snapshot; do not rely on it as current assurance. No installed release is qualified by this assessment.';
}

---
trigger: always_on
---

# PM Workspace — Peer Review & Synthetic Verification

1. **Branch & Handoff Hygiene**: Keep each feature on its own branch from `origin/main` and do not mix unrelated files into feature commits. Hand off exact branch names, commit SHAs, and verification evidence for peer review, and check the combined merge candidate before release.
2. **Synthetic Browser Edge Cases for Search**: Exercise task-specific edge cases in an isolated synthetic browser as well as rendered/unit tests. For search inputs, test a long unbroken pasted query (180+ chars) and a no-match state, verify zero page-level horizontal overflow at phone (`390px`) and desktop (`1280px`) widths, then use `Clear` and confirm normal matching and existing item actions still work.
3. **Scroll Shortcuts & Minimal State**: For jump or scroll shortcuts, verify both a changed selection and the same selection after real scrolling, plus a target outside the available data range. Reuse existing sort, current-item, and navigation behavior before introducing new state, effects, or DOM geometry lookups.
4. **Accurate Evidence Reporting**: Report measured widths (`scrollWidth` vs `clientWidth`), the exact synthetic fixture scope, and any new failure accurately. Keep UI peer-review checks isolated to local synthetic data, and report any separately authorized staging or rollout checks on their own.
5. **Hosted CI Before & After Merge**: Before merging, verify that the required hosted GitHub Actions checks finished successfully for the exact current PR head SHA. A local pass is useful for diagnosis, while a hosted failure or pending check means pause and report it before merging. After merging, capture the exact merge SHA and verify the GitHub Actions push run on `main` for that SHA completed successfully. Report the merge SHA and the hosted run link, or the exact blocker if it has not passed.

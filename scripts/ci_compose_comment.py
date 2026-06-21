#!/usr/bin/env python3
"""Compose the PR comment and workflow outputs from apply_submission results.

Reads every ``_ci/results/*.json`` produced by ``apply_submission.py``, writes a
Markdown summary to ``_ci/comment.md``, and appends ``accepted`` / ``invalid``
booleans to ``$GITHUB_OUTPUT`` so the workflow can decide whether to publish and
whether to fail the check. Kept as a separate script (instead of an inline
heredoc) to avoid YAML/Python indentation pitfalls.
"""
import glob
import json
import os


def main() -> None:
    results = []
    for path in sorted(glob.glob("_ci/results/*.json")):
        try:
            with open(path, encoding="utf-8") as f:
                results.append(json.load(f))
        except Exception as exc:  # pragma: no cover
            results.append({"status": "error", "instance": path,
                            "message": str(exc), "errors": [str(exc)]})

    lines = ["## BDSP submission check", ""]
    accepted = invalid = False

    if not results:
        lines.append("_No solution files were found to validate._")

    for r in results:
        status = r.get("status")
        inst = r.get("instance")
        if status == "accepted":
            accepted = True
            lines.append(
                f"- :white_check_mark: **{inst}** — new best known solution "
                f"**{r.get('new_bks')}** (previous BKS {r.get('previous_bks')}, "
                f"gap {r.get('gap_pct')}%). Published to the collection."
            )
        elif status == "valid_no_improvement":
            lines.append(
                f"- :heavy_check_mark: **{inst}** — feasible (objective "
                f"{r.get('objective')}) but not better than the current BKS "
                f"{r.get('previous_bks')}. No change made."
            )
        elif status == "invalid":
            invalid = True
            errs = "; ".join(str(e) for e in r.get("errors", []))
            if len(errs) > 600:
                errs = errs[:600] + "…"
            lines.append(f"- :x: **{inst}** — invalid: {r.get('message')}")
            if errs:
                lines.append(f"    - `{errs}`")
        else:
            invalid = True
            lines.append(f"- :warning: **{inst}** — error: {r.get('message')}")

    lines.append("")
    if accepted:
        lines.append("The collection data (`data/instances.json` / `.js` and "
                     "`sols/`) was updated automatically. Thank you for contributing!")
    lines.append("")
    lines.append("<sub>Automated by <code>.github/workflows/validate-submission.yml</code> "
                 "using the bundled <code>bdsp-validator</code>. The objective and feasibility "
                 "are recomputed from your matrix — claimed values are ignored.</sub>")

    os.makedirs("_ci", exist_ok=True)
    body = "\n".join(lines) + "\n"
    with open("_ci/comment.md", "w", encoding="utf-8") as f:
        f.write(body)

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as f:
            f.write(f"accepted={'true' if accepted else 'false'}\n")
            f.write(f"invalid={'true' if invalid else 'false'}\n")

    print(body)


if __name__ == "__main__":
    main()

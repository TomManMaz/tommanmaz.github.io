#!/usr/bin/env python3
"""Process a BKS submission made through a GitHub issue (new-bks.yml form).

Driven by .github/workflows/validate-issue-submission.yml. Reads the issue
body/author from the environment, extracts the solution (an attachment link
or pasted CSV), re-validates it with the bundled validator via
scripts/apply_submission.py, and writes:

  * _ci/comment.md          — the verdict comment for the issue
  * $GITHUB_OUTPUT          — accepted=true|false

SECURITY MODEL: the issue body is untrusted DATA. Nothing from it is ever
executed; the instance name is validated against a strict pattern and must
exist in the committed collection; the solution is only fetched from
github.com attachments or public gists and parsed as a 0/1 matrix by the
trusted validator.

Environment:
  ISSUE_BODY    (required) — the issue body text
  ISSUE_AUTHOR  (required) — the submitter's GitHub login
  ISSUE_TITLE   (optional) — used as an instance-name fallback ("[BKS] name")
  APPLY         (optional) — "0" for a dry run (default "1")

Exit code 0 for every handled outcome (accepted / no improvement / invalid /
malformed submission); nonzero only for unexpected internal errors.
"""

import json
import os
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))
from apply_submission import process_submission  # noqa: E402

INSTANCE_NAME_RE = re.compile(r"^[A-Za-z0-9_]{1,64}$")

# GitHub-hosted issue attachments only (both the current and the legacy form).
ATTACHMENT_RE = re.compile(
    r"https://github\.com/"
    r"(?:user-attachments/files/\d+/[A-Za-z0-9._%-]+"
    r"|[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/files/\d+/[A-Za-z0-9._%-]+)"
)

# Public gists — the fallback for solutions submitted from the CLI/API, which
# cannot upload issue attachments. Fetched via the gists API; raw content only
# from gist.githubusercontent.com.
GIST_RE = re.compile(r"https://gist\.github\.com/(?:[A-Za-z0-9-]+/)?([0-9a-f]{20,40})\b")
GIST_RAW_PREFIX = "https://gist.githubusercontent.com/"

MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024
FETCH_TIMEOUT_S = 60


def form_field(body: str, label: str) -> str:
    """Extract the value of one issue-form field ('### <label>' section)."""
    pattern = re.compile(
        r"^###\s+" + re.escape(label) + r"\s*\n(.*?)(?=^###\s|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    m = pattern.search(body)
    if not m:
        return ""
    value = m.group(1).strip()
    return "" if value == "_No response_" else value


def resolve_instance_name(body: str, title: str, attachment_url: str | None) -> str | None:
    """Instance field, else '[BKS] <name>' from the title, else the file stem."""
    candidates = [form_field(body, "Instance")]
    m = re.match(r"\[BKS\]\s*([A-Za-z0-9_]+)", title or "")
    if m:
        candidates.append(m.group(1))
    if attachment_url:
        stem = attachment_url.rsplit("/", 1)[-1]
        stem = re.sub(r"\.(csv|txt)$", "", stem, flags=re.IGNORECASE)
        candidates.append(stem)
    for c in candidates:
        c = c.strip()
        if c and INSTANCE_NAME_RE.match(c):
            return c
    return None


def extract_pasted_csv(section: str) -> str | None:
    """Pasted matrix: a fenced code block, or bare 0/1 CSV lines."""
    m = re.search(r"```[a-zA-Z]*\n(.*?)```", section, re.DOTALL)
    text = m.group(1) if m else section
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if lines and all(re.match(r"^[01](?:\s*,\s*[01])*$", ln) for ln in lines):
        return "\n".join(lines) + "\n"
    return None


def _get(url: str, api: bool = False) -> bytes:
    headers = {"User-Agent": "bdsp-submission-bot"}
    token = os.environ.get("GH_TOKEN")
    if api and token:  # avoids the 60/h unauthenticated API limit on shared runners
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_S) as resp:
        data = resp.read(MAX_ATTACHMENT_BYTES + 1)
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise ValueError(f"Attachment exceeds the {MAX_ATTACHMENT_BYTES // 2**20} MB limit.")
    return data


def fetch_attachment(url: str, dest: Path) -> None:
    dest.write_bytes(_get(url))


def pick_gist_file(files: dict, instance: str) -> dict:
    """The gist file named <instance>.csv/.txt, else its only .csv/.txt file."""
    candidates = [f for name, f in files.items()
                  if re.search(r"\.(csv|txt)$", name, re.IGNORECASE)]
    for f in candidates:
        if re.sub(r"\.(csv|txt)$", "", f["filename"], flags=re.IGNORECASE) == instance:
            return f
    if len(candidates) == 1:
        return candidates[0]
    raise ValueError(f"The gist must contain {instance}.csv "
                     "(or exactly one .csv file).")


def find_solution_link(solution_section: str, body: str):
    """('attachment', url) | ('gist', id) | None.

    The Solution field wins over the rest of the body, so a link pasted in
    another field never overrides the one the submitter put in that field.
    """
    for text in (solution_section, body):
        m = ATTACHMENT_RE.search(text)
        if m:
            return "attachment", m.group(0)
        m = GIST_RE.search(text)
        if m:
            return "gist", m.group(1)
    return None


def fetch_gist(gist_id: str, instance: str, dest: Path, author: str) -> None:
    meta = json.loads(_get(f"https://api.github.com/gists/{gist_id}", api=True))
    owner = ((meta.get("owner") or {}).get("login") or "")
    # Credit goes to the issue author, so the gist must be theirs: nobody can
    # resubmit someone else's public gist under their own name.
    if owner.lower() != author.lower():
        raise ValueError(f"The linked gist belongs to @{owner or 'unknown'}, not to you; "
                         "link a gist from your own account.")
    raw_url = pick_gist_file(meta.get("files") or {}, instance).get("raw_url", "")
    if not raw_url.startswith(GIST_RAW_PREFIX):
        raise ValueError("Unexpected gist download location.")
    dest.write_bytes(_get(raw_url))


def compose_comment(author: str, result: dict) -> str:
    status = result.get("status")
    instance = result.get("instance") or "?"
    lines = [f"Hi @{author}, thanks for the submission!", ""]
    if status == "accepted":
        gap = result.get("gap_pct")
        gap_txt = f", gap to lower bound {gap}%" if gap is not None else ""
        lines += [
            f"✅ **Accepted — new best known solution for `{instance}`.**",
            "",
            f"Objective **{result['objective']}** (previous BKS: "
            f"{result.get('previous_bks')}{gap_txt}).",
            "",
            f"It is published on the [collection]"
            f"(https://tommanmaz.github.io/bdsp_collection.html) and recorded as "
            f"`sols/{instance}.csv`, credited to @{author}. Closing this issue — "
            "thank you for the contribution!",
        ]
    elif status == "valid_no_improvement":
        lines += [
            f"☑️ **Feasible, but not an improvement for `{instance}`.**",
            "",
            f"Your objective is **{result['objective']}**; the current BKS is "
            f"**{result.get('previous_bks')}**. Only strictly better solutions are "
            "published. Feel free to edit this issue with an improved file — it "
            "re-validates automatically.",
        ]
    elif status == "invalid":
        lines += [f"❌ **Not valid for `{instance}`.**", "", result.get("message", "")]
        errors = [e for e in result.get("errors", []) if e]
        if errors:
            lines += ["", "```", *errors[:15], "```"]
        lines += [
            "",
            "You can debug it with the [online validator]"
            "(https://tommanmaz.github.io/bdsp_validate.html), then edit this "
            "issue — it re-validates automatically.",
        ]
    else:  # malformed submission / unknown instance / internal error
        lines += [f"⚠️ **Could not process this submission.**", "", result.get("message", "")]
        lines += [
            "",
            "Make sure the **Instance** field holds an exact instance name from the "
            "[collection](https://tommanmaz.github.io/bdsp_collection.html) and the "
            "**Solution file** field has your CSV attached. Edit this issue "
            "to retry.",
        ]
    return "\n".join(lines) + "\n"


def write_outputs(accepted: bool) -> None:
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"accepted={'true' if accepted else 'false'}\n")


def main() -> int:
    body = os.environ.get("ISSUE_BODY", "")
    author = os.environ.get("ISSUE_AUTHOR", "").strip()
    title = os.environ.get("ISSUE_TITLE", "")
    apply_changes = os.environ.get("APPLY", "1") != "0"

    if not author or not re.match(r"^[A-Za-z0-9-]{1,39}$", author):
        print("Missing or malformed ISSUE_AUTHOR.", file=sys.stderr)
        return 2

    solution_section = form_field(body, "Solution file")
    link = find_solution_link(solution_section, body)
    attachment_url = link[1] if link and link[0] == "attachment" else None
    gist_id = link[1] if link and link[0] == "gist" else None
    instance = resolve_instance_name(body, title, attachment_url)

    result: dict = {"instance": instance, "status": "error", "message": ""}
    tmpdir = Path(tempfile.mkdtemp(prefix="bdsp-issue-"))
    csv_path = tmpdir / f"{instance or 'submission'}.csv"

    try:
        if instance is None:
            result["message"] = ("No valid instance name found "
                                 "(letters, digits and underscores only).")
        else:
            pasted = extract_pasted_csv(solution_section)
            if attachment_url:
                fetch_attachment(attachment_url, csv_path)
            elif gist_id:
                fetch_gist(gist_id, instance, csv_path, author)
            elif pasted:
                csv_path.write_text(pasted, encoding="utf-8")
            else:
                result["message"] = ("No solution found: attach a .csv file in the "
                                     "'Solution file' section (or link a public gist).")
                csv_path = None

            if csv_path is not None:
                result = process_submission(
                    solution_path=csv_path,
                    instance_name=instance,
                    author=author,
                    apply=apply_changes,
                )
    except Exception as exc:  # network failure, oversized file, validator crash
        result = {"instance": instance, "status": "error",
                  "message": f"Processing failed: {exc}", "errors": []}

    print(json.dumps(result, indent=2))

    ci_dir = REPO_ROOT / "_ci"
    ci_dir.mkdir(exist_ok=True)
    (ci_dir / "comment.md").write_text(compose_comment(author, result), encoding="utf-8")

    write_outputs(accepted=result.get("status") == "accepted")
    return 0


if __name__ == "__main__":
    sys.exit(main())

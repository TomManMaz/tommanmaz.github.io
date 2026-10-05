#!/usr/bin/env python3
"""Tests for the BKS submission-parsing pipeline (GitHub issue bodies).

Covers the accepted solution formats — attachment link (the issue form's
upload field), public gist link and pasted 0/1 matrix — instance-name
resolution, the verdict
comment, and a dry run of process_issue_submission.py on real archived
solutions.

Run from the repository root:   python scripts/submission_test.py
Needs: sortedcontainers (validator dependency).
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import process_issue_submission as pis  # noqa: E402

PASSED = 0
FAILED = 0


def check(cond: bool, label: str) -> None:
    global PASSED, FAILED
    if cond:
        PASSED += 1
    else:
        FAILED += 1
        print(f"FAIL  {label}")


def form_body(instance: str, solution_value: str) -> str:
    """An issue body as the new-bks.yml form renders it."""
    return "\n".join([
        "### Instance", "", instance, "",
        "### Solution file", "", solution_value, "",
    ])


ATT = "https://github.com/user-attachments/files/123/realistic_10_1.csv"


def test_field_parsing() -> None:
    body = form_body("realistic_10_1", f"[realistic_10_1.csv]({ATT})")
    check(pis.form_field(body, "Instance") == "realistic_10_1",
          "instance field parsed")
    section = pis.form_field(body, "Solution file")
    m = pis.ATTACHMENT_RE.search(section)
    check(m is not None and m.group(0) == ATT,
          "upload-field attachment link found")
    check(pis.form_field(body, "Nonexistent") == "", "missing section is empty")
    check(pis.form_field("### Instance\n\n_No response_\n", "Instance") == "",
          "form placeholder is empty")
    check(pis.ATTACHMENT_RE.search("https://evil.example/files/1/x.csv") is None,
          "non-GitHub URL is not treated as an attachment")


def test_gist_links() -> None:
    gid = "f0bbfbcd40012d83ab5f81604334e147"
    for url in (f"https://gist.github.com/someuser/{gid}", f"https://gist.github.com/{gid}"):
        m = pis.GIST_RE.search(f"[x.csv]({url})")
        check(m is not None and m.group(1) == gid, f"gist id parsed from {url}")
    check(pis.GIST_RE.search("https://gist.evil.example/u/" + gid) is None,
          "non-GitHub gist host rejected")

    def f(name):
        return {"filename": name, "raw_url": pis.GIST_RAW_PREFIX + name}
    files = {"notes.md": f("notes.md"), "realistic_10_1.csv": f("realistic_10_1.csv"),
             "realistic_10_2.csv": f("realistic_10_2.csv")}
    check(pis.pick_gist_file(files, "realistic_10_2")["filename"] == "realistic_10_2.csv",
          "gist file matching the instance is picked")
    check(pis.pick_gist_file({"sol.csv": f("sol.csv")}, "realistic_10_1")["filename"]
          == "sol.csv", "single gist CSV is picked")
    try:
        pis.pick_gist_file(files, "realistic_10_3")
        check(False, "ambiguous gist must be rejected")
    except ValueError:
        check(True, "ambiguous gist rejected")


def test_link_precedence_and_gist_owner() -> None:
    gist = "https://gist.github.com/owner1/" + "a" * 32
    body = "### Instance\n\nrealistic_10_1\n\n### Notes\n\nsee " + ATT + "\n\n### Solution file\n\n" + gist + "\n"
    section = pis.form_field(body, "Solution file")
    check(pis.find_solution_link(section, body) == ("gist", "a" * 32),
          "link in the Solution field wins over one elsewhere in the body")
    check(pis.find_solution_link("", "text " + ATT) == ("attachment", ATT),
          "body is searched when the Solution field has no link")

    real_get = pis._get
    pis._get = lambda url, api=False: json.dumps(
        {"owner": {"login": "owner1"},
         "files": {"x.csv": {"filename": "x.csv", "raw_url": pis.GIST_RAW_PREFIX + "x"}}}).encode()
    try:
        try:
            pis.fetch_gist("a" * 32, "realistic_10_1", Path(os.devnull), "someone-else")
            check(False, "gist owned by someone else must be refused")
        except ValueError as exc:
            check("belongs to @owner1" in str(exc), "foreign gist refused with owner named")
    finally:
        pis._get = real_get


def _dry_run(name: str, csv_text: str) -> dict:
    tmp = Path(tempfile.mkdtemp(prefix="bdsp-test-")) / f"{name}.csv"
    tmp.write_bytes(csv_text.encode("utf-8"))
    out = subprocess.run(
        [sys.executable, "scripts/apply_submission.py", "-s", str(tmp), "-i", name],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=600,
    ).stdout
    return json.loads(out[out.index("{"):])


def test_strict_format_and_coverage() -> None:
    """The CI must reject what the browser rejects (same strict parser) and
    must never accept a leg covered twice (it can lower the objective)."""
    name = "realistic_10_1"
    rows = (REPO_ROOT / "sols" / f"{name}.csv").read_text(encoding="utf-8").split()
    base = "\n".join(rows) + "\n"

    check(_dry_run(name, "﻿" + base).get("valid") is True, "UTF-8 BOM accepted")
    check(_dry_run(name, base.replace("\n", "\r\n")).get("valid") is True, "CRLF accepted")
    check(_dry_run(name, "\n\n" + base + "\n\n").get("valid") is True, "blank lines accepted")

    r = _dry_run(name, "\n".join(row + "," for row in rows) + "\n")
    check(r.get("status") == "invalid" and "columns" in r.get("message", ""), "trailing comma rejected")
    r = _dry_run(name, base.replace("0", "2", 1))
    check(r.get("status") == "invalid" and "only 0 and 1" in r.get("message", ""), "non-binary cell rejected")

    # Duplicate one assigned leg: copy a 1 from row 0 into the same column of row 1.
    r0, r1 = rows[0].split(","), rows[1].split(",")
    j = r0.index("1")
    r1[j] = "1"
    dup = "\n".join([rows[0], ",".join(r1)] + rows[2:]) + "\n"
    r = _dry_run(name, dup)
    check(r.get("status") == "invalid" and any("Duplicate legs" in e for e in r.get("errors", [])),
          f"duplicate leg rejected ({r.get('status')}: {r.get('errors')})")


def test_canonical_csv() -> None:
    import apply_submission as aps
    tmp = Path(tempfile.mkdtemp(prefix="bdsp-test-")) / "x.csv"
    tmp.write_bytes("﻿1, 0 ,1.0\r\n\r\n0,0,0\r\n0.0,1,0\r\n".encode("utf-8"))
    check(aps._canonical_csv(tmp) == "1,0,1\n0,1,0\n",
          "published CSV is re-serialized (no BOM/CRLF/blank/all-zero rows)")


def test_instance_resolution() -> None:
    check(pis.resolve_instance_name(form_body("realistic_10_1", "x"), "", None)
          == "realistic_10_1", "instance from form field")
    check(pis.resolve_instance_name("", "[BKS] realistic_10_1", None)
          == "realistic_10_1", "instance from title fallback")
    check(pis.resolve_instance_name("", "", ATT) == "realistic_10_1",
          "instance from attachment file stem")
    check(pis.resolve_instance_name(form_body("../etc", "x"), "", None) is None,
          "bad instance name rejected")


def test_pasted_matrix() -> None:
    check(pis.extract_pasted_csv("```\n1,0\n0,1\n```") == "1,0\n0,1\n",
          "fenced pasted matrix parsed")
    check(pis.extract_pasted_csv("1,0\n0,1") == "1,0\n0,1\n",
          "bare pasted matrix parsed")
    check(pis.extract_pasted_csv("not a matrix") is None,
          "non-matrix text yields None")


def test_comment_contract() -> None:
    """One verdict emoji per status (they are documented in
    submissions/README.md) plus the @author greeting."""
    base = {"instance": "realistic_10_1", "objective": 100,
            "previous_bks": 200, "message": "boom", "errors": []}
    emojis = {"accepted": "✅", "valid_no_improvement": "☑️",
              "invalid": "❌", "error": "⚠️"}
    for status, emoji in emojis.items():
        comment = pis.compose_comment("someuser", dict(base, status=status))
        check(emoji in comment, f"{status}: verdict emoji {emoji} present")
        others = [e for e in emojis.values() if e != emoji]
        check(all(e not in comment for e in others),
              f"{status}: no other verdict emoji")
        check("@someuser" in comment, f"{status}: greets the submitter")


def test_dry_run_end_to_end() -> None:
    """Full process_issue_submission.py run (APPLY=0) with real archived
    solutions pasted as matrices. Both are at best equal to the stored BKS,
    so the expected verdict is valid_no_improvement."""
    for name in ("realistic_10_1", "realistic_10_2"):
        text = (REPO_ROOT / "sols" / f"{name}.csv").read_bytes().decode("utf-8")
        body = form_body(name, "```\n" + text + "```")
        env = dict(os.environ,
                   ISSUE_BODY=body,
                   ISSUE_AUTHOR="jane-doe",
                   ISSUE_TITLE=f"[BKS] {name}",
                   APPLY="0")
        env.pop("GITHUB_OUTPUT", None)
        proc = subprocess.run(
            [sys.executable, "scripts/process_issue_submission.py"],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=600, env=env,
        )
        check(proc.returncode == 0, f"{name}: exit code {proc.returncode}: "
              f"{proc.stderr[:400]}")
        if proc.returncode != 0:
            continue
        try:
            result = json.loads(proc.stdout)
        except ValueError:
            check(False, f"{name}: stdout is not JSON: {proc.stdout[:200]}")
            continue
        check(result.get("status") == "valid_no_improvement",
              f"{name}: status {result.get('status')} ({result.get('message')})")
        check(result.get("valid") is True, f"{name}: not valid")
        comment = (REPO_ROOT / "_ci" / "comment.md").read_text(encoding="utf-8")
        check("@jane-doe" in comment, f"{name}: comment credits the issue author")
    shutil.rmtree(REPO_ROOT / "_ci", ignore_errors=True)


def main() -> int:
    test_field_parsing()
    test_gist_links()
    test_link_precedence_and_gist_owner()
    test_strict_format_and_coverage()
    test_canonical_csv()
    test_instance_resolution()
    test_pasted_matrix()
    test_comment_contract()
    test_dry_run_end_to_end()
    print(f"\n{PASSED} passed, {FAILED} failed")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())

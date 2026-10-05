# Submit an improved BDSP solution

Found a solution that beats a current **best known solution (BKS)** in the
[instance collection](https://tommanmaz.github.io/bdsp_collection.html)?
Submitting it takes about a minute. A GitHub Action re-validates your solution
and, if it is **feasible** and **strictly better** than the listed BKS, it is
published automatically as the new BKS, credited to your GitHub account.

## How to submit

1. **[Open a submission issue](https://github.com/TomManMaz/tommanmaz.github.io/issues/new?template=new-bks.yml)**.
2. Fill in the **Instance** field with the exact instance name (e.g.
   `realistic_50_23`, `breakMax_100_1`) — see the names in the
   [collection](https://tommanmaz.github.io/bdsp_collection.html).
3. **Attach your solution CSV** in the *Solution file* field and submit the
   issue.
4. The bot comments the verdict within a minute or two:
   - ✅ **accepted** — feasible and better: published as the new BKS, the issue
     is closed, and you are credited as the contributor.
   - ☑️ **no improvement** — feasible but not better than the current BKS.
   - ❌ **invalid** — infeasible or it does not cover every leg exactly once
     (the error is shown in the comment).

   If something went wrong, **edit the issue** (fix the attachment or the
   instance name) — it re-validates automatically.

**Submitting from the command line or API?** Those cannot upload issue
attachments: put the CSV in a public [gist](https://gist.github.com) named
`<instance>.csv` and link it instead. Keep the `[BKS] <instance>` title so the
bot picks the issue up, e.g.

```
gh gist create --public realistic_50_23.csv
gh issue create --repo TomManMaz/tommanmaz.github.io --title "[BKS] realistic_50_23" \
  --body $'### Instance\n\nrealistic_50_23\n\n### Solution file\n\n<gist URL>'
```

The easiest starting point is the
[online validator](https://tommanmaz.github.io/bdsp_validate.html): validate
your file there first, and when it beats the BKS the results page offers the
pre-filled submission link and the correctly named download.

## Solution file format

A header-less CSV **binary assignment matrix**:

- one **row per employee** (driver), one **column per leg**, in the instance's
  leg order (legs are ordered by start time, matching the instance JSON);
- cell `i,j` is `1` if leg `j` is assigned to employee `i`, else `0`;
- every leg must be covered by **exactly one** employee; all-zero rows are
  ignored.

Example (3 employees, 5 legs):

```
1,0,1,0,0
0,1,0,0,1
0,0,0,1,0
```

The objective and feasibility are **recomputed from your matrix** — any claimed
value is ignored, so there is nothing to game. The objective is

```
Obj = sum over shifts of ( 2*W' + T + ride + 30*changes + 180*splits )
```

with the hard constraints (max driving 9 h, working 10 h, total 14 h, plus
driving-rest and rest-break rules) described on the
[problem reference](https://tommanmaz.github.io/bdsp_problem.html) page and in
[`bdsp-validator/`](../bdsp-validator/).

## What gets recorded

When a submission is accepted, the workflow updates `data/instances.json` and
`data/instances.js` (new `bks`, `best_algorithm` = your handle,
`bks_source: community`, `submitted_by`, `submitted_at`, and the per-employee
`solution_breakdown`), saves your file as `sols/<instance>.csv`, and appends an
entry to [`accepted.json`](accepted.json) so the record survives future data
rebuilds.

`accepted.json` is the only file kept in this folder; submitted CSVs live on as
`sols/<instance>.csv`.

# Submit an improved BDSP solution

Found a solution that beats a current **best known solution (BKS)** in the
[instance collection](https://tommanmaz.github.io/bdsp_collection.html)? You can
contribute it with a pull request. A GitHub Action re-validates your solution
and, if it is **feasible** and **strictly better** than the listed BKS, it is
published automatically as the new BKS.

## How to submit

1. **Fork** this repository and create a branch.
2. Add **one** solution file at `submissions/<instance>.csv`, where
   `<instance>` is exactly the instance name (e.g. `realistic_50_23.csv`,
   `breakMax_100_1.csv`). See the names in the
   [collection](https://tommanmaz.github.io/bdsp_collection.html).
3. Open a **pull request**. Change *only* that one CSV file — PRs that touch
   other files are not auto-validated.
4. The bot comments the verdict within a minute or two:
   - ✅ **accepted** — feasible and better: published as the new BKS, the PR is
     closed, and you are credited as the contributor.
   - ☑️ **no improvement** — feasible but not better than the current BKS.
   - ❌ **invalid** — infeasible or it does not cover every leg exactly once
     (the error is shown in the comment).

You can pre-check your file in the browser with the
[online validator](https://tommanmaz.github.io/bdsp_validate.html) before
opening a PR.

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

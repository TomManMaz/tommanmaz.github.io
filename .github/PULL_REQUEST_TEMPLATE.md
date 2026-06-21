<!--
Submitting an improved BDSP solution? Add exactly one file at
submissions/<instance>.csv (header-less binary employee × leg matrix) and change
nothing else. A GitHub Action validates it and, if it is feasible and strictly
better than the current best known solution, publishes it automatically.
See submissions/README.md for the full format and process.

For any other change, just describe it below and delete the checklist.
-->

## Solution submission

- **Instance:** <!-- e.g. realistic_50_23 -->
- **Claimed objective:** <!-- optional; the bot recomputes it anyway -->
- **How it was produced:** <!-- solver / method, optional -->

### Checklist
- [ ] The PR adds exactly one `submissions/<instance>.csv` and changes no other files.
- [ ] `<instance>` matches a name in the collection.
- [ ] The CSV is a header-less binary matrix (rows = employees, columns = legs in start-time order).
- [ ] I checked feasibility with the [online validator](https://tommanmaz.github.io/bdsp_validate.html) (recommended).

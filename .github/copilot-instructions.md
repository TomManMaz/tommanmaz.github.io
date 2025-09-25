# Copilot Instructions for tommanmaz.github.io

## Project Overview
This is a personal academic homepage for Tommaso Mannelli Mazzoli, a PhD student at TU Wien focusing on combinatorial optimization. The site showcases research on the Bus Driver Scheduling Problem (BDSP) and solutions to American Mathematical Monthly (AMM) problems.

## Architecture & Structure

### Core Navigation Pattern
- **Main pages**: `index.html`, `publications.html`, `bdsp.html`, `amm.html`
- **Shared components**: All pages use identical header/navbar structure with `stylesheet.css`
- **Navigation state**: Active page indicated by `class="active"` on navbar links

### Content Categories
1. **Personal homepage** (`index.html`) - Biography, contact, research interests
2. **Publications** (`publications.html`) - Academic papers with structured citation format
3. **BDSP research** (`bdsp.html`) - Interactive data tables with algorithm performance comparisons
4. **AMM problems** (`amm.html`) - Mathematical problems with MathJax LaTeX rendering

### Data Processing Workflow
- **CSV → HTML Tables**: Use `html_converter.py` to process algorithm performance data
- **Pattern**: Raw CSV files (e.g., `BKS_realistic_1.csv`) → processed HTML tables embedded in pages
- **Data structure**: Columns include algorithm names (BP, SA, HC, TS, CMSA, LNS), bounds, and gap calculations
- **Interactive features**: JavaScript `exportTableToCSV()` functions for data download

## Styling & UI Conventions

### CSS Architecture (`stylesheet.css`)
- **CSS Variables**: Primary color `--primary-color: #004080`, secondary backgrounds, hover states
- **Responsive tables**: `.responsive-table` with horizontal scroll on mobile
- **Sticky headers**: Table headers use `position: sticky` for long datasets
- **Navigation**: Blue primary color scheme with white text on hover/active states

### Mathematical Content
- **MathJax integration**: Load via CDN for LaTeX rendering in BDSP and AMM pages
- **Notation**: Use `\mathop{}\!\mathrm{d}` for differentials, proper mathematical formatting
- **References**: Structured citation format with DOI links in `<cite>` tags

## File Organization Patterns

### Static Assets
- **PDFs**: Research papers in `/docs/`, AMM solutions in `/AMM/`, CV files at root
- **Images**: `tmm.jpg` (profile), `Dorabadge5.png` (DORA badge), `icon.png` (favicon)
- **Data**: Algorithm performance CSVs at root level, individual instance data in `/sols/`

### Development Files
- **Processing scripts**: `html_converter.py` for CSV-to-HTML table generation
- **Drafts**: Files with `_OLD` suffix are previous versions, `prova.py` for experimentation
- **Jekyll config**: `_config.yml` with minimal theme (GitHub Pages compatible)

## Key Patterns for AI Agents

### Adding New Research Data
1. Create CSV with algorithm performance columns (BP, SA, HC, TS, CMSA, LNS, bound)
2. Process with `html_converter.py` pattern: calculate BKS (minimum), gap percentages, winning algorithm
3. Embed generated HTML table in research page with proper headers and download functionality

### Mathematical Content Updates
- Always include MathJax script: `<script async id="MathJax-script" src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`
- Use consistent LaTeX formatting for integrals, mathematical notation
- Include problem statements in table format with solution PDF links

### Page Structure Consistency
```html
<header class="header">...</header>
<nav class="navbar">...</nav>  <!-- Update active class appropriately -->
<main>...</main>
<footer class="footer">...</footer>  <!-- Optional, not on all pages -->
```

### Citation Format
- Conference papers: **Title**, Authors, *Conference/Journal*, DOI link
- Preprints: Include arXiv links
- Theses: Title with PDF link and year

## External Dependencies
- **MathJax 3**: Mathematical notation rendering
- **Jekyll**: GitHub Pages hosting with minimal theme
- **GitHub Pages**: Hosting platform, follows `_config.yml` settings

When modifying this site, maintain the clean academic presentation, consistent navigation, and interactive data table functionality that characterizes the current implementation.
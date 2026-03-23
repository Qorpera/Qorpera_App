# Entity Resolution & Record Linkage Techniques for Multi-Connector B2B Platforms

**Researched:** 2026-03-20
**Prompt:** Research entity resolution and record linkage techniques for matching business contacts and companies across multiple SaaS data sources (Gmail, HubSpot, Stripe, Slack, accounting software). Cover probabilistic matching, ML-based tools, blocking strategies, active learning, dirty data handling, and conflict resolution — with practical implementation details for a TypeScript/PostgreSQL/pgvector stack currently using exact email match for auto-merge.

## Key Findings

- **Fellegi-Sunter probabilistic matching** with calibrated m/u weights dramatically outperforms ad-hoc scoring — email exact match alone yields F1 0.55–0.75; adding tuned Fellegi-Sunter lifts to F1 0.90–0.95; adding behavioral signals (email thread co-occurrence, Slack channel overlap) reaches F1 0.95–0.97
- **Multi-pass blocking** (email domain + phonetic last name + trigram company name + pgvector KNN + normalized phone) reduces the N² comparison space while maintaining >99% pair completeness — PostgreSQL extensions `pg_trgm` and `fuzzystrmatch` provide native blocking primitives
- **Active learning with uncertainty sampling** requires only 15–30 strategically selected labeled pairs to match or exceed 200 randomly labeled pairs — Dedupe library demonstrated this consistently
- **String similarity algorithm selection matters by field type**: Jaro-Winkler for person names (0.85–0.88 threshold), Token Set Ratio with TF-IDF weighting for company names (0.75 threshold), E.164-normalized exact match for phones, nickname dictionary expansion for first names (~2000 common mappings)
- **No mature TypeScript entity resolution library exists** — the practical pattern is: implement Jaro-Winkler/Levenshtein natively (~50 lines each), use PostgreSQL extensions for blocking, implement Fellegi-Sunter scoring in TypeScript, reserve Python (Splink/Dedupe) for offline batch weight calibration

## Full Research

### 1. Probabilistic Matching with Fellegi-Sunter Model

#### Core Theory

The Fellegi-Sunter (1969) model is the foundational framework for probabilistic record linkage. It treats each field comparison as an independent piece of evidence and combines them using likelihood ratios.

For each comparison field (name, email, phone, etc.), two probabilities are estimated:

- **m-probability**: P(fields agree | records are a true match). E.g., if two records truly represent the same person, what's the probability their phone numbers match? Might be 0.85 (accounting for people changing numbers, data entry errors).
- **u-probability**: P(fields agree | records are NOT a match). E.g., if two records are different people, what's the probability their phone numbers coincidentally match? Might be 0.0001 for a 10-digit phone number.

#### Weight Calculation

For each field comparison, a weight is computed:

```
Agreement weight   = log2(m / u)
Disagreement weight = log2((1 - m) / (1 - u))
```

Example weights for B2B contact matching:

| Field | m-prob | u-prob | Agree weight | Disagree weight |
|-------|--------|--------|-------------|----------------|
| Email (exact) | 0.95 | 0.00001 | +16.5 | -4.3 |
| Phone (normalized) | 0.85 | 0.0001 | +13.1 | -2.7 |
| Last name (exact) | 0.90 | 0.005 | +7.5 | -3.3 |
| First name (exact) | 0.85 | 0.01 | +6.4 | -2.7 |
| Company name (fuzzy) | 0.80 | 0.02 | +5.3 | -2.3 |
| City | 0.70 | 0.05 | +3.8 | -1.2 |
| Job title (fuzzy) | 0.50 | 0.10 | +2.3 | -0.5 |

The total score for a record pair is the sum of individual field weights. Fields that agree add positive weight; fields that disagree add negative weight.

#### Three-Zone Classification

Two thresholds divide the score space:

- **Upper threshold (T_match)**: Pairs scoring above this are declared matches. Typically set to achieve a desired false-match rate. Common value: 12–15 for contact data.
- **Lower threshold (T_non-match)**: Pairs scoring below this are declared non-matches. Common value: 0–3.
- **Between thresholds**: "Possible matches" requiring manual review.

**Practical threshold calibration**: Start with a labeled sample of ~500 known match/non-match pairs. Plot score distributions for true matches vs true non-matches. Set T_match where false-positive rate drops below 1%, and T_non-match where false-negative rate drops below 1%. The overlap region is your clerical review zone.

#### Partial Agreement & String Similarity Integration

Modern implementations extend Fellegi-Sunter beyond binary agree/disagree:

- **Partial agreement levels**: Exact match (full weight), close match via Jaro-Winkler > 0.92 (75% of full weight), partial match via Jaro-Winkler > 0.85 (50% of full weight), disagree (full disagreement weight).
- **Frequency-based m/u estimation**: Common names (John Smith) get lower agreement weight than rare names (Xenophon Papadopoulos).

#### EM Algorithm for Weight Estimation

When you don't have labeled training data, the Expectation-Maximization (EM) algorithm estimates m and u probabilities unsupervised:

1. **Initialize**: Guess m=0.9, u=0.1 for all fields
2. **E-step**: For each record pair, compute probability it's a match given current m/u values
3. **M-step**: Re-estimate m/u values using the match probabilities as weights
4. **Repeat** until convergence (typically 10–20 iterations)

This works well in practice because the agreement patterns for true matches vs non-matches are usually well-separated.

---

### 2. ML-Based Entity Resolution Libraries and Tools (2025–2026)

#### Dedupe (Python)

**How it works**: Active learning approach combined with regularized logistic regression.

1. **Blocking**: Uses a learned blocking scheme — tests many possible blocking rules (e.g., "first 3 chars of last name", "zip code") and selects the combination that covers the most true pairs with the fewest comparisons. Uses a greedy set-cover algorithm.
2. **Active learning**: Presents the user with ambiguous record pairs and asks "Is this a match?" Strategically selects pairs near the decision boundary (uncertainty sampling). Typically needs 15–30 labeled pairs to converge.
3. **Comparison**: Computes string similarity features (Affine gap distance — a variant of edit distance that penalizes gap openings more than gap extensions) for each field.
4. **Classification**: Trains a regularized logistic regression on the labeled examples. Simple model but effective because blocking has already eliminated obvious non-matches.
5. **Clustering**: Uses hierarchical agglomerative clustering with a learned threshold to group records, handling transitive relationships.

**Practical considerations**: Works well for datasets up to ~1M records. Memory-intensive for larger datasets. Python-only — in a TypeScript stack, run as a microservice or batch job. The active learning UI needs to be built into your application.

**Architecture for TypeScript integration**: Run Dedupe as a Python microservice behind a REST API. Export trained model weights. For real-time matching, pre-compute blocking keys and use the logistic regression weights in TypeScript (they're just field-weight multiplications).

#### Splink (UK Ministry of Justice)

**Architecture**: Built on Apache Spark (PySpark) or DuckDB for local execution. Implements Fellegi-Sunter with modern extensions.

**Key features**:
- **Term frequency adjustments**: Automatically down-weights common values. "John Smith" gets less weight than "Zephyr Moonstone."
- **Multiple comparison levels**: Not just agree/disagree — supports exact, Jaro-Winkler > 0.92, Jaro-Winkler > 0.85, and disagree for each field.
- **EM training**: Unsupervised weight estimation without labeled data.
- **Waterfall charts**: Excellent visualization of how each field contributes to match weight.
- **DuckDB mode**: Can run on a single machine without Spark, handling ~10M records on a laptop.

**Parameters that matter**:
- `link_type`: "dedupe_only" (within one dataset) or "link_only" (across datasets) or "link_and_dedupe"
- `blocking_rules_to_generate_predictions`: List of SQL-like blocking rules
- `comparisons`: List of comparison definitions with levels
- `max_iterations`: For EM, typically 10–25
- `em_convergence`: Default 0.0001

**Benchmark**: On the Febrl synthetic dataset (5000 records, 20% duplicates), Splink achieves precision ~0.98, recall ~0.95 with default settings and no labeled data.

#### Zingg

**Architecture**: Distributed entity resolution on Apache Spark. Designed for enterprise-scale (billions of records).

**How it differs**: Uses a neural network (not logistic regression) for matching. Supports active learning like Dedupe but scales horizontally. Has a "Zingg pipe" concept for incremental matching — when new records arrive, they're matched against existing clusters without re-processing everything.

**Practical relevance**: Overkill for most B2B SaaS applications. The Spark dependency is heavy. Consider only if processing >10M records regularly.

#### AWS Entity Resolution

**Service launched**: GA in 2023, significant updates through 2025.

**Approach**: Managed service with three matching modes:
- **Rule-based**: Define matching rules (e.g., "exact email OR fuzzy name + exact company")
- **ML-based**: AWS's pre-trained models for contact/company matching
- **Provider-based**: Integrates with LiveRamp, TransUnion for identity resolution

**Cost model**: Per-record processing ($0.25 per 1000 records processed). Can get expensive at scale.

**Integration**: Reads from S3/Glue, outputs to S3. Requires ETL pipeline from PostgreSQL. Adds AWS dependency and latency. Good for batch processing, not real-time matching.

#### Senzing

**Approach**: Real-time entity resolution engine. Uses a pre-built, rules-based approach tuned by decades of entity resolution research. No ML training needed — ships with expert-derived rules for person and company matching.

**Key innovation**: "Entity-aware" — when resolving entity A with B, and B was already resolved with C, it automatically re-evaluates the A-B-C cluster. Handles transitive closure correctly.

**Architecture**: Runs as an embedded library (C-based) or containerized service. Has a REST API. Supports PostgreSQL as a backend.

**Practical fit**: Best for real-time, stream-based entity resolution. Significant license cost for commercial use. Very fast — can process thousands of records per second.

#### TypeScript/JavaScript Libraries (2025–2026)

The JavaScript ER ecosystem remains thin compared to Python. Key options:

- **fuzzball.js**: Port of FuzzyWuzzy (Python) to JavaScript. Provides `fuzz.ratio`, `fuzz.partial_ratio`, `fuzz.token_sort_ratio`, `fuzz.token_set_ratio`. Useful for company name matching.
- **string-similarity (npm)**: Dice coefficient and best-match functions. Simple but limited.
- **natural (npm)**: NLP library with phonetic algorithms (Soundex, Metaphone, Double Metaphone), stemmers, tokenizers. Useful building block.

**Practical approach for TypeScript**: Rather than finding a TypeScript ER library, the proven pattern is:
1. Implement string similarity functions natively in TypeScript (Jaro-Winkler, Levenshtein are simple algorithms, ~50 lines each)
2. Use PostgreSQL functions for blocking (trigram indexes via pg_trgm, phonetic functions via fuzzystrmatch extension)
3. Implement Fellegi-Sunter scoring in TypeScript — it's just weighted sums
4. Use pgvector for embedding-based candidate generation
5. Reserve Python (Splink/Dedupe) for offline batch reprocessing and weight calibration

---

### 3. Blocking Strategies

Blocking is critical — without it, comparing N records requires N×(N-1)/2 comparisons. For 100K records, that's ~5 billion comparisons.

#### Sorted Neighborhood

**Algorithm**: Sort records by a blocking key (e.g., Soundex of last name + first 3 chars of city). Slide a window of size W over the sorted list. Compare all pairs within each window.

**Parameters**: Window size W=10–30 is typical. Larger windows catch more true matches but increase comparisons quadratically within each window.

**Multi-pass variant**: Run sorted neighborhood multiple times with different sort keys. Take the union of candidate pairs. E.g., Pass 1: sort by Soundex(lastname), Pass 2: sort by first 5 chars of email, Pass 3: sort by phone area code.

**For PostgreSQL**: Can be implemented as a window function query. Efficient because it leverages B-tree indexes on the sort key.

#### Canopy Clustering

**Algorithm**:
1. Pick a random record, create a canopy around it using a distance metric
2. All records within distance T1 (loose threshold) are in the canopy
3. All records within distance T2 (tight threshold, T2 < T1) are removed from the candidate pool
4. Repeat until all records are assigned to at least one canopy
5. Only compare records within the same canopy

**Parameters**: T1 and T2 depend on the distance metric. For TF-IDF cosine similarity on names: T1 = 0.3 (include), T2 = 0.7 (exclude).

**Advantage**: Records can be in multiple canopies, reducing missed matches. Soft blocking.

**For pgvector**: Natural fit — use cosine distance on entity name embeddings. T1 corresponds to a pgvector distance threshold in a KNN query.

#### Locality-Sensitive Hashing (LSH)

**Concept**: Hash records such that similar records have higher probability of colliding (opposite of cryptographic hashing).

**MinHash for Jaccard similarity** (good for token sets like company names):
1. Represent each record as a set of tokens/q-grams
2. Apply k hash functions to each set, keep minimum hash value for each
3. Records with many matching MinHash values are candidate pairs

**Parameters**: k=100 hash functions with b=20 bands of r=5 rows. This creates an S-curve where pairs with Jaccard similarity > 0.5 have ~97% chance of becoming candidates, while pairs with similarity < 0.2 have ~1% chance.

**For PostgreSQL**: Can pre-compute LSH signatures and store as integer arrays. Index with GIN. Compare with array overlap operators.

#### Phonetic Blocking

**Soundex**: Maps names to a letter + 3 digits. "Robert" → R163, "Rupert" → R163. Very coarse — high recall but many false candidates.

**Metaphone / Double Metaphone**: More accurate phonetic encoding. Handles English pronunciation rules. "Schmidt" and "Smith" both map to SM0/XMT. Double Metaphone provides primary and alternate encodings.

**For B2B contacts**: Phonetic blocking on last name + exact match on first initial catches many name variations. PostgreSQL's `fuzzystrmatch` extension provides Soundex, Metaphone, and Levenshtein functions natively.

```sql
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

SELECT a.id, b.id
FROM entities a, entities b
WHERE a.id < b.id
AND soundex(a.last_name) = soundex(b.last_name)
AND levenshtein(lower(a.first_name), lower(b.first_name)) <= 2;
```

#### Q-gram Blocking

**Concept**: Break strings into overlapping character subsequences of length q. "Smith" with q=2: {Sm, mi, it, th}. Records sharing enough q-grams are candidates.

**Parameters**: q=2 or q=3. Require at least t common q-grams, where t = max(1, min_len - q + 1 - max_edits × q). For Levenshtein distance 1, q=2: strings must share at least (len-2) bigrams.

**PostgreSQL implementation**: The `pg_trgm` extension uses q=3 (trigrams) and provides:
- `similarity(a, b)` — trigram similarity, 0 to 1
- `a % b` — similarity above threshold (default 0.3)
- GIN/GiST indexes on trigram for fast candidate retrieval

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_entity_name_trgm ON entities USING gin (name gin_trgm_ops);

SELECT id, name, similarity(name, 'Acme Corporation') as sim
FROM entities
WHERE name % 'Acme Corporation'
ORDER BY sim DESC;
```

#### Recommended Multi-Pass Blocking Strategy for Multi-Connector B2B

1. **Pass 1 — Email domain**: Group by email domain. Compare all contacts within the same domain. Catches same-company contacts.
2. **Pass 2 — Phonetic last name + first initial**: Catches name matches without email.
3. **Pass 3 — Phone number (normalized)**: Exact match on normalized phone.
4. **Pass 4 — pgvector embedding similarity**: KNN search on entity embeddings with distance threshold. Catches semantically similar entities that miss string-based blocks.
5. **Pass 5 — Company name trigrams**: For company entity matching, use pg_trgm with threshold 0.4.

Take the union of candidate pairs from all passes, deduplicate, then run detailed comparison.

---

### 4. Active Learning Approaches

#### Uncertainty Sampling

**Core idea**: Present human reviewers with record pairs where the model is least confident. This maximizes information gain per labeled example.

**Implementation**:
1. Score all candidate pairs with current model
2. Rank by distance from decision boundary (e.g., |score - threshold|)
3. Present the top-K most uncertain pairs to reviewer
4. Retrain model with new labels
5. Repeat until model stabilizes (accuracy on held-out set stops improving)

**Practical threshold**: In Dedupe's experience, 15–30 strategically selected pairs often outperform 200 randomly selected pairs.

#### Query-by-Committee

**Approach**: Train multiple models (e.g., logistic regression with different feature subsets). Present pairs where models disagree most. More robust than single-model uncertainty but more complex to implement.

#### Confidence Calibration

**Problem**: Match scores don't naturally correspond to probabilities. A score of 12.5 doesn't mean "95% chance of match."

**Platt scaling**: Fit a logistic regression on top of match scores using a validation set. Maps raw scores to calibrated probabilities. Requires ~200 labeled pairs.

**Isotonic regression**: Non-parametric calibration. More flexible than Platt scaling but needs more data (~500 pairs).

**For the review UI**: After calibration, present matches in buckets:
- 0.95–1.00: Auto-merge (show for transparency but don't require approval)
- 0.80–0.95: Likely match (require one-click confirmation)
- 0.50–0.80: Possible match (require careful review with full context)
- Below 0.50: Don't surface

#### Human-in-the-Loop Architecture

For a B2B platform with trust gradient (Observe → Propose → Act), entity resolution fits naturally:

**Observe phase**: System detects potential duplicates, shows them in a review queue. User confirms or rejects. All merges are human-approved.

**Propose phase**: System auto-merges high-confidence pairs (>0.95), queues medium-confidence for review, and explains reasoning ("same email domain, similar name, appeared in same Slack channel").

**Act phase**: Full auto-merge above threshold, with undo capability. System learns from past merge decisions to improve future matching.

**Feedback loop**: Every human merge/reject decision becomes training data. Periodically retrain the model (weekly batch job). Track precision over time — if users reject more than 5% of proposals, lower the auto-merge threshold.

---

### 5. Handling Dirty Data

#### Name Variations

**Nickname handling**: Maintain a nickname dictionary. Common mappings:
- Robert → Bob, Rob, Bobby, Robbie, Bert
- William → Bill, Will, Billy, Liam
- Elizabeth → Liz, Beth, Betty, Eliza, Lisa
- Richard → Rick, Rich, Dick
- James → Jim, Jimmy, Jamie

**Sources**: Public nickname databases (e.g., the "diminutives.csv" dataset with ~2000 name mappings). Store as a PostgreSQL lookup table.

**Implementation**: Before comparison, expand first names to their canonical form or compare against all known variants. Two records match on first name if either the names are similar (Jaro-Winkler > 0.85) OR they share a common canonical name.

**International names**: Handle transliteration (e.g., "Müller" = "Mueller" = "Muller"). Use Unicode normalization (NFKD form) and strip diacritical marks. Name ordering varies by culture (Eastern order: family name first).

#### Company Name Normalization

**Step 1 — Suffix removal**: Strip common suffixes: Inc, Inc., Incorporated, LLC, L.L.C., Ltd, Ltd., Limited, Corp, Corp., Corporation, GmbH, AG, S.A., S.A.S., Co, Co., Company, PLC, LP, LLP, & Co, & Company

**Step 2 — Article/filler removal**: Remove "The", "A" from start. Remove "of", "and", "&" for comparison purposes.

**Step 3 — Whitespace/punctuation normalization**: Collapse whitespace, remove periods, normalize hyphens and apostrophes.

**Step 4 — Common abbreviation expansion**: "Intl" → "International", "Natl" → "National", "Mgmt" → "Management", "Tech" → "Technology" (bidirectional comparison — try both forms)

**Example pipeline**:
```
"The Acme Corporation, Inc."
→ "Acme Corporation, Inc."     (article removal)
→ "Acme Corporation"           (suffix removal)
→ "acme corporation"           (lowercase)
→ "acme corporation"           (whitespace normalization)
```

"Acme Corp.", "ACME CORPORATION, INC.", and "The Acme Corporation" all normalize to the same form.

#### Phone Number Normalization

Use a phone number parsing library (e.g., `libphonenumber-js` npm package):

1. Parse with country hint (default to operator's country)
2. Convert to E.164 format: +1234567890
3. Store both normalized and original
4. Compare normalized forms only

**Edge cases**: Extensions ("x123"), vanity numbers, landline vs mobile for same person.

#### Missing Field Handling

**Strategy**: Missing fields should be neutral — neither evidence for nor against a match.

In Fellegi-Sunter terms: when a field is missing in either record, assign weight 0 (no evidence). Don't penalize. This is important because different connectors provide different fields — Gmail gives email but no phone, Stripe gives email and maybe phone, HubSpot gives everything.

**Partial record assessment**: Track field completeness per source. If a record has only email and name, the maximum possible match score is limited. Adjust thresholds proportionally, or use a separate threshold table based on field availability patterns.

#### Cross-System Inconsistencies

**Field availability by connector**:

| Field | HubSpot | Gmail | Stripe | Slack |
|-------|---------|-------|--------|-------|
| Name | Structured (first/last) | Free-form "From" header | Free-form | Display name |
| Email | Primary + secondary | From/To/CC | Primary | Workspace email |
| Phone | Formatted by region | N/A | N/A | N/A |
| Company | Company association | Email domain | Description field | Workspace name |
| Title | Structured field | Email signature (unreliable) | N/A | Title field |

**Name parsing from free-form**: For Gmail "From" headers like "Bob Smith <bob@acme.com>" or "Dr. Robert J. Smith III", use a name parsing library. In JavaScript, `parse-full-name` handles prefixes, suffixes, and middle names.

**Email domain → Company mapping**: Maintain a mapping of email domains to company entities. When a new contact arrives from Gmail with "@acme.com", link to the Acme company entity. Exclude common domains (gmail.com, yahoo.com, outlook.com, etc.) — maintain a free-email-provider list.

---

### 6. Conflict Resolution

When two sources disagree about an entity's properties (e.g., HubSpot says phone is "555-0100", Stripe says "555-0200").

#### Source Reliability Ranking

Assign a trust score per source per field type:

| Field | Most Reliable | Less Reliable | Least Reliable |
|-------|--------------|---------------|----------------|
| Email | Gmail (it's the source) | HubSpot | Stripe |
| Phone | HubSpot (CRM, manually curated) | Stripe | Gmail (signature parsing) |
| Company name | HubSpot | Stripe | Gmail domain inference |
| Job title | HubSpot | Slack profile | N/A |
| Address | Stripe (billing) | HubSpot | N/A |

**Implementation**: Store a `sourceReliability` map in configuration. When merging, keep the value from the most reliable source for each field.

#### Recency-Based Resolution

**Principle**: More recent data is more likely current (people change jobs, phones, addresses).

**Implementation**: Track `lastUpdatedAt` per field per source. When merging, prefer the most recent non-null value. Exception: if the most recent update is from a less reliable source and the update is very recent (within 24 hours), flag for review — it might be a data quality issue rather than a real change.

**Hybrid approach** (recommended): Use source reliability as the primary factor, recency as the tiebreaker. If the reliable source's data is more than 6 months old and a less reliable source has recent data, prefer the recent data but flag the conflict.

#### Voting / Consensus

When 3+ sources provide a value, use majority vote. If HubSpot says "Acme Inc", Stripe says "Acme Inc.", and Gmail says "Acme", the normalized form "Acme" wins by consensus.

#### Property-Level Provenance

**Critical pattern**: Don't just store the "winning" value — store all values with their sources and timestamps:

```json
{
  "phone": {
    "value": "+15550100",
    "source": "hubspot",
    "updatedAt": "2026-03-15",
    "alternatives": [
      { "value": "+15550200", "source": "stripe", "updatedAt": "2026-02-01" }
    ]
  }
}
```

This enables: undo on bad merges, showing provenance in UI, recomputing resolution if rules change.

---

### 7. Practical Implementation for Multi-Connector B2B

#### Recommended Three-Tier Matching Pipeline

**Tier 1 — Deterministic Matching (Real-time, during sync)**
- Exact email match: Confidence 1.0, auto-merge
- Normalized phone match: Confidence 0.95, auto-merge if name similarity > 0.7
- Exact domain + exact last name: Confidence 0.85, auto-merge if source is personal connector

Run during connector sync post-sync hooks. Low latency, high precision.

**Tier 2 — Probabilistic Matching (Near real-time, after sync)**
- Blocking: Multi-pass (email domain, phonetic last name, pgvector KNN)
- Comparison: Fellegi-Sunter with pre-calibrated weights
- Fields: Name (Jaro-Winkler), company (token set ratio + TF-IDF), phone (normalized exact), email domain, behavioral signals (same Slack channels, same email threads)
- Classification: Score > 15 → auto-merge, 8–15 → review queue, < 8 → non-match

Run as a background job triggered after sync completes. Process new/updated entities against existing entity graph.

**Tier 3 — Batch Reprocessing (Scheduled)**
- Weekly full re-evaluation of all entity pairs within blocking windows
- Retrain weights using accumulated human decisions
- Audit merged entities for potential false merges (split detection)
- Run Splink or Dedupe (Python) for weight calibration, export weights to TypeScript runtime

#### Behavioral Signals (Unique to Multi-Connector Platforms)

Beyond traditional fields, leverage cross-connector behavioral evidence:

- **Co-occurrence in email threads**: If entity A and entity B appear in the same email threads, they're more likely to be correctly linked (not duplicates of each other, but validate company associations).
- **Slack channel membership**: Entities appearing in the same Slack channels likely work at the same company.
- **Deal/invoice association**: If a contact in HubSpot is on a deal, and a Stripe customer has invoices for the same amount/company, strong evidence of match.
- **Temporal correlation**: If events from two entities always occur near each other in time, they may be the same entity acting through different systems.

**Implementing behavioral scoring**: Compute a "behavioral similarity" score as a single Fellegi-Sunter field:
- m-probability: P(entities share 3+ email threads | true match) ≈ 0.4
- u-probability: P(entities share 3+ email threads | non-match) ≈ 0.001
- Agreement weight: ~8.6 (very discriminating)

#### PostgreSQL-Specific Implementation

**Extensions needed**:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
```

**Materialized blocking keys**:
```sql
ALTER TABLE "Entity" ADD COLUMN IF NOT EXISTS
  phonetic_key TEXT GENERATED ALWAYS AS (
    soundex(properties->>'lastName')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_entity_name_trgm
  ON "Entity" USING gin ((properties->>'name') gin_trgm_ops);
```

**Candidate generation query combining multiple blocking strategies**:
```sql
WITH new_entity AS (
  SELECT * FROM "Entity" WHERE id = $1
),
candidates AS (
  -- Block 1: Same email
  SELECT e.id, 1.0 as block_confidence FROM "Entity" e, new_entity n
  WHERE e.properties->>'email' = n.properties->>'email'

  UNION

  -- Block 2: Phonetic last name + same company domain
  SELECT e.id, 0.7 FROM "Entity" e, new_entity n
  WHERE soundex(e.properties->>'lastName') = soundex(n.properties->>'lastName')
  AND e.properties->>'emailDomain' = n.properties->>'emailDomain'

  UNION

  -- Block 3: pgvector similarity (top 20 nearest)
  SELECT e.id, 0.5 FROM "Entity" e, new_entity n
  WHERE e."entityEmbedding" IS NOT NULL AND n."entityEmbedding" IS NOT NULL
  ORDER BY e."entityEmbedding" <=> n."entityEmbedding"
  LIMIT 20

  UNION

  -- Block 4: Company name trigram similarity
  SELECT e.id, 0.6 FROM "Entity" e, new_entity n
  WHERE e.properties->>'companyName' % n.properties->>'companyName'
)
SELECT DISTINCT id, MAX(block_confidence) as max_block_conf
FROM candidates
WHERE id != $1
GROUP BY id;
```

#### Merge Transaction Safety

Additional considerations beyond basic transactional merges:

- **Merge audit log**: Record every merge with before/after state, confidence score, and whether it was auto or human-approved. Enables undo.
- **Merge cascading**: When merging entity A into B, all relationships pointing to A must be redirected to B. Check for duplicate relationships (A→C and B→C become just B→C).
- **Anti-merge list**: Allow users to explicitly mark two entities as "not the same." Store as `MergeExclusion` records. Future matching must skip these pairs.

---

### 8. Accuracy Benchmarks

#### Expected Precision/Recall by Approach

| Approach | Precision | Recall | F1 | Notes |
|----------|-----------|--------|----|-------|
| Exact email only | 0.99+ | 0.40–0.60 | 0.55–0.75 | Misses people with multiple emails |
| Fellegi-Sunter (tuned) | 0.95–0.98 | 0.85–0.92 | 0.90–0.95 | Requires weight calibration |
| Splink (EM-trained) | 0.95–0.98 | 0.88–0.94 | 0.92–0.96 | No labeled data needed |
| Dedupe (active learning) | 0.96–0.99 | 0.90–0.95 | 0.93–0.97 | Best with 30+ labeled pairs |
| Deep learning (DITTO, 2020) | 0.97–0.99 | 0.93–0.97 | 0.95–0.98 | Requires GPU, large training set |
| Hybrid (deterministic + ML) | 0.97–0.99 | 0.92–0.96 | 0.95–0.97 | Recommended for production |

#### Benchmark Datasets

- **Febrl**: Synthetic Australian census data. 4 datasets of varying difficulty. Easy to use but not representative of B2B data.
- **DBLP-Scholar**: Bibliographic records. Good for name matching evaluation.
- **Abt-Buy**: Product matching across e-commerce sites. Tests entity resolution across different schemas.
- **North Carolina Voter Registration**: Real-world, large-scale. Often used in academic papers.
- **Company matching**: No great public benchmark exists for B2B company matching — build from own data.

#### Practical Expectations (B2B SaaS Context)

With multi-connector setup (Gmail + HubSpot + Stripe + Slack):

- **Email-matchable contacts** (~60–70% of entities): Near-perfect matching. Same email appears in multiple systems.
- **Name-only contacts** (~20–30%): F1 of 0.85–0.92 with tuned Fellegi-Sunter. Higher with behavioral signals.
- **Company entities** (~10–15%): Company name matching is harder due to abbreviations, parent/subsidiary relationships. F1 of 0.80–0.88.
- **Overall** with hybrid approach: Precision 0.95+, Recall 0.88+ achievable with 2–3 months of calibration data.

#### Error Analysis Categories

Monitor these failure modes:
- **False merges** (low precision): Two different John Smiths at the same company. Mitigate with role/title comparison.
- **Missed merges** (low recall): Same person with different emails across systems (personal vs work). Mitigate with behavioral signals and name+company matching.
- **Transitive errors**: A merges with B, B merges with C, but A and C are different entities. Mitigate with cluster-level validation — after merging, check all pairwise similarities within the cluster.

---

### 9. String Similarity Algorithms

#### Jaro-Winkler

**How it works**: Computes similarity based on character matches within a window and transpositions. Jaro similarity ranges 0–1. Winkler modification boosts score for strings sharing a common prefix (up to 4 characters).

**Formula**:
```
Jaro = (matches/|s1| + matches/|s2| + (matches-transpositions)/matches) / 3
Winkler = Jaro + prefix_length × p × (1 - Jaro)
```
Where p = 0.1 (standard scaling factor), prefix_length = min(4, common prefix length).

**When to use**: Best for person names. Gives high scores for common prefix names ("Smith" vs "Smyth" = 0.96). Less effective for company names with different word order.

**Parameters**: Prefix weight p = 0.1 is standard. Don't go above 0.25 — it over-weights prefix matches.

**Thresholds for B2B**:
- Exact match: 1.0
- Strong match: > 0.92 (reasonable for auto-merge when combined with other fields)
- Possible match: > 0.85 (flag for review)
- Below 0.85: Treat as different

#### Levenshtein (Edit Distance)

**How it works**: Minimum number of single-character edits (insert, delete, substitute) to transform one string into another.

**Normalized**: Divide by max string length to get 0–1 similarity: `1 - (edit_distance / max(|s1|, |s2|))`

**When to use**: Good for detecting typos. "Robert" → "Roberr" has distance 1. Less useful for name variations ("Robert" → "Bob" has distance 5).

**Damerau-Levenshtein**: Adds transposition as an edit operation. "Robert" → "Rotber" costs 1 instead of 2. Recommended over plain Levenshtein for name matching.

**PostgreSQL**: `levenshtein()` function from fuzzystrmatch. Also `levenshtein_less_equal()` for short-circuiting when distance exceeds a threshold — much faster for large-scale comparisons.

#### Cosine Similarity on Character N-grams

**How it works**:
1. Break each string into character n-grams (typically bigrams or trigrams)
2. Create a frequency vector for each string
3. Compute cosine similarity between vectors

**Example**: "Smith" → bigrams {Sm, mi, it, th}, "Smyth" → {Sm, my, yt, th}. Intersection: {Sm, th}. Cosine similarity ≈ 0.50.

**When to use**: Better than Jaro-Winkler for company names because it's order-independent. "Acme Software Inc" vs "Software by Acme" will have high trigram overlap despite different word order.

**PostgreSQL**: pg_trgm provides this natively with `similarity()` function. Default threshold 0.3 for the `%` operator.

#### TF-IDF for Company Names

**Concept**: Weight terms by how discriminating they are. "Corporation" appears in many company names (low IDF) while "Qorpera" is unique (high IDF).

**Implementation**:
1. Build a corpus of all company names in the database
2. Compute IDF for each token: `log(N / df(token))` where N is total companies and df is how many contain this token
3. For comparing two company names, compute TF-IDF vectors and use cosine similarity

**Practical impact**: Without TF-IDF, "Acme Corporation" matches "Beta Corporation" on 50% of tokens. With TF-IDF, "Corporation" gets near-zero weight and "Acme" gets high weight, correctly reducing the similarity.

**Stop words for company names**: Remove not just standard stop words but also: Inc, LLC, Ltd, Corporation, Corp, Company, Co, Group, Holdings, International, Services, Solutions, Technologies, Consulting, Partners, Associates, Enterprises.

#### Token-Based Similarities

**Token Sort Ratio** (from FuzzyWuzzy/fuzzball): Sort tokens alphabetically, then compute edit distance ratio. "Goldman Sachs Group" vs "Sachs Goldman Group" → both become "Goldman Group Sachs" → score 1.0.

**Token Set Ratio**: Split into tokens, compute intersection and remainders, then compare. Better for partial matches: "Acme" vs "Acme Software Corporation" gets a high score because the intersection ("Acme") is a perfect match.

**Recommendation for company names**: Use Token Set Ratio as the primary company name similarity metric, with TF-IDF weighting. Handles both word reordering and partial matches.

#### Algorithm Selection by Field

| Field | Primary Algorithm | Secondary | Threshold |
|-------|------------------|-----------|-----------|
| First name | Jaro-Winkler | Nickname lookup | 0.85 |
| Last name | Jaro-Winkler | Soundex equality | 0.88 |
| Email | Exact (lowercased) | Domain match | 1.0 / N/A |
| Phone | Exact (E.164 normalized) | Last 7 digits | 1.0 / 0.9 |
| Company name | Token Set Ratio + TF-IDF | Trigram (pg_trgm) | 0.75 |
| Job title | Token Set Ratio | N/A | 0.70 |
| Address/City | Levenshtein (normalized) | N/A | 0.90 |

---

### 10. Graph-Based Approaches

#### Transitive Closure

**Problem**: If A matches B and B matches C, should A and C be merged? Not necessarily — the A-C similarity might be low (each step is marginal).

**Naive transitive closure**: Merge all connected components. Fast but error-prone. Tends to create "mega-clusters" where chains of marginal matches snowball.

**Mitigated transitive closure**: After computing connected components, verify that all pairwise similarities within each component exceed a minimum threshold. If any pair falls below, split the component.

**Star merge pattern**:
1. For each connected component, designate the node with the most connections (or highest data completeness) as the "hub"
2. Only merge spokes into the hub, not spokes with each other
3. Re-evaluate hub-spoke similarity after each merge (hub's data improves)

#### Connected Components for Merge Chains

**Algorithm**:
1. Build a graph where entities are nodes and high-confidence match pairs are edges
2. Find connected components (Union-Find data structure, O(n) with path compression)
3. Each component is a merge cluster

**In PostgreSQL** (recursive CTE for transitive closure):
```sql
WITH RECURSIVE merge_chain AS (
  SELECT entity_a_id as root, entity_b_id as member
  FROM match_candidates
  WHERE score > 15

  UNION

  SELECT mc.root, c.entity_b_id
  FROM merge_chain mc
  JOIN match_candidates c ON mc.member = c.entity_a_id
  WHERE c.score > 15
  AND c.entity_b_id != mc.root
)
SELECT root, array_agg(DISTINCT member) as cluster_members
FROM merge_chain
GROUP BY root;
```

**Caution**: This recursive CTE can be expensive and may produce overly large clusters. In practice, limit chain length (add a depth counter) and validate clusters.

#### Graph Partitioning

**Correlation clustering**: Assign positive weights (match evidence) and negative weights (non-match evidence) to edges. Find the partitioning that minimizes total disagreement (positive edges cut + negative edges within clusters). NP-hard but good approximation algorithms exist.

**For practical use**: After initial matching, represent uncertain pairs as weighted edges. Run a simple greedy correlation clustering:
1. Start with each entity in its own cluster
2. For each pair in descending score order: if merging their clusters reduces total disagreement, merge them
3. Stop when no merge improves the objective

#### Entity Graph for Relationship Validation

Beyond direct matching, the entity relationship graph provides validation signals:

- **Shared relationships**: If two contact entities both have relationships to the same company entity, they're more likely to be matches (or at least related).
- **Contradictory relationships**: If two contact entities are both marked as "CEO" of different companies, they're less likely to be the same person.
- **Graph structure consistency**: After a proposed merge, check if the resulting entity has contradictory relationships (e.g., employee-of two competing companies). Flag for review.

#### Graph Embeddings for Entity Resolution

**Node2Vec / Graph Neural Networks**: Embed entities based on their position in the relationship graph. Entities with similar relationship patterns get similar embeddings, even if their string-level properties differ.

**Practical approach**: Combine traditional string-based features with graph embedding features in the Fellegi-Sunter framework. The graph embedding similarity becomes another comparison field with its own m/u weights.

**For pgvector**: Could store graph embeddings alongside text embeddings in a separate vector column. Combined similarity: `0.6 × text_embedding_similarity + 0.4 × graph_embedding_similarity`.

---

### Implementation Roadmap

**Phase 1 (Current → Near-term)**:
- Enhance existing identity-resolution.ts with Fellegi-Sunter scoring and proper field weights
- Add PostgreSQL extensions (pg_trgm, fuzzystrmatch) for blocking
- Implement phone normalization (libphonenumber-js) and company name normalization
- Add nickname dictionary for first name matching
- Build merge review UI with confidence scores

**Phase 2 (Mid-term)**:
- Implement multi-pass blocking (email domain, phonetic, trigram, pgvector)
- Add behavioral signals from ActivitySignal and ContentChunk co-occurrence
- Build active learning loop — track human merge/reject decisions
- Implement conflict resolution with source reliability ranking
- Add merge audit log and undo capability

**Phase 3 (Long-term)**:
- Run Splink (Python batch job) weekly for weight calibration against accumulated labeled data
- Implement graph-based validation (connected components with pairwise verification)
- Add anti-merge exclusion list
- Consider graph embeddings for relationship-aware matching
- Target: Precision 0.97+, Recall 0.92+, auto-merge rate 70%+

## Sources

- Fellegi, I. P., & Sunter, A. B. (1969). "A Theory for Record Linkage." *Journal of the American Statistical Association*, 64(328), 1183–1210.
- Dedupe library: https://github.com/dedupeio/dedupe — Active learning entity resolution (Python)
- Splink (UK Ministry of Justice): https://github.com/moj-analytical-services/splink — Probabilistic record linkage at scale
- Zingg: https://github.com/zinggAI/zingg — ML-based entity resolution on Spark
- AWS Entity Resolution: https://aws.amazon.com/entity-resolution/
- Senzing: https://senzing.com/ — Real-time entity resolution engine
- DITTO (Li et al., 2020): "Deep Entity Matching with Pre-Trained Language Models." *VLDB 2020*.
- Febrl benchmark datasets: https://recordlinkage.readthedocs.io/en/latest/ref-datasets.html
- fuzzball.js (FuzzyWuzzy port): https://github.com/nol13/fuzzball.js
- libphonenumber-js: https://github.com/catamphetamine/libphonenumber-js
- natural (NLP library): https://github.com/NaturalNode/natural
- parse-full-name: https://www.npmjs.com/package/parse-full-name
- PostgreSQL pg_trgm: https://www.postgresql.org/docs/current/pgtrgm.html
- PostgreSQL fuzzystrmatch: https://www.postgresql.org/docs/current/fuzzystrmatch.html
- pgvector: https://github.com/pgvector/pgvector
- Christen, P. (2012). *Data Matching: Concepts and Techniques for Record Linkage, Entity Resolution, and Duplicate Detection*. Springer.
- Papadakis, G., et al. (2021). "Blocking and Filtering Techniques for Entity Resolution: A Survey." *ACM Computing Surveys*, 53(2).

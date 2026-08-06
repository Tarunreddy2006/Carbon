# Stomata Biochar Platform – Feedstock Intelligence Engine (Phase 3 Documentation)

## Executive Overview
The **Feedstock Intelligence Engine (Phase 3)** transforms biomass feedstock management from a passive inventory log into an intelligent, decision-support system. By analyzing moisture history, dry matter yields, storage degradation, contamination status, and supplier delivery consistency, the engine provides actionable insights to help producers purchase higher-quality biomass, reduce energy loss during pyrolysis, and maximize net carbon removal credit yields.

---

## 1. System Architecture & Workflow

```mermaid
flowchart TD
    A[Biomass Delivery Intake] --> B[Feedstock Lot Registration]
    B -->|Lot #, Species, Storage Days, Moisture %| C[Feedstock Intelligence Service]
    
    C --> D[Feedstock Rule Engine]
    C --> E[Feedstock Quality Score Service]
    C --> F[Supplier Analytics Service]

    D -->|Moisture > 25% / Storage > 60d / Contamination| G[Rule Trigger & Alerts]
    E -->|Weighted Score 0-100%| H[Feedstock Quality Score]
    F -->|Historical Deliveries & Rejections| I[Supplier Reliability Index]

    G --> J[Feedstock Intelligence Dashboard]
    H --> J
    I --> J

    J --> K[Actionable Recommendation Panel]
    J --> L[Chain of Custody Traceability Root Node (Phase 4 Ready)]
```

---

## 2. Feedstock Quality Score Formula

Each feedstock lot receives an automated **Quality Score ($Q_{\text{lot}}$ from $0.0\%$ to $100.0\%$)** computed from 4 weighted factors:

$$Q_{\text{lot}} = S_{\text{moisture}} + S_{\text{contamination}} + S_{\text{storage}} + S_{\text{dry\_matter}}$$

1. **Moisture Content Score ($S_{\text{moisture}} \le 35\%$)**:
   - $M_{\%} \le 15.0\% \implies 35.0\%$
   - $15.0\% < M_{\%} \le 25.0\% \implies 25.0\%$
   - $M_{\%} > 25.0\% \implies 10.0\%$
2. **Contamination Score ($S_{\text{contamination}} \le 35\%$)**:
   - Clean / Uncontaminated $\implies 35.0\%$
   - Foreign material contamination flagged $\implies 0.0\%$
3. **Storage Duration Score ($S_{\text{storage}} \le 15\%$)**:
   - Storage Days $\le 30 \implies 15.0\%$
   - $30 < \text{Storage Days} \le 60 \implies 10.0\%$
   - Storage Days $> 60 \implies 5.0\%$
4. **Dry Matter Yield Potential Score ($S_{\text{dry\_matter}} \le 15\%$)**:
   - $\left(\frac{W_{\text{dry}}}{W_{\text{wet}}}\right) \times 15.0\%$

---

## 3. Feedstock Rule Engine & Classification

| Rule ID | Rule Category | Trigger Condition | Severity | Actionable Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| `RULE_HIGH_MOISTURE` | Moisture Control | $\text{Moisture} > 25.0\%$ | Warning | "Pre-dry feedstock before kiln intake to avoid energy loss." |
| `RULE_EXTENDED_STORAGE` | Storage Degradation | $\text{Storage Days} > 60$ | Warning | "Prioritize processing older biomass lots to prevent volatile carbon degradation." |
| `RULE_CONTAMINATION_DETECTED` | Contamination Alert | $\text{Contamination Status} = \text{True}$ | High Risk | "Perform physical screening & manual inspection before feeding biomass into reactor." |
| `RULE_POOR_SUPPLIER` | Supplier Reliability | $\text{Supplier Score} < 70.0\%$ | Warning | "Review supplier procurement contract and request certified biomass moisture reports." |

### Quality Status Classification
- **High Risk**: Contamination flagged or Critical anomaly
- **Warning**: Active rule warnings or Quality Score $< 75\%$
- **Acceptable**: Quality Score between $75\%$ and $89.9\%$
- **Optimal**: Quality Score $\ge 90\%$

---

## 4. Supplier Performance Analytics

The **Supplier Analytics Service** aggregates historical delivery lots per supplier and calculates:
- **Total Deliveries**, **Accepted Deliveries**, and **Rejected Deliveries**
- **Average Moisture %** & **Average Dry Matter %**
- **Average Biochar Yield %**
- **Overall Quality Score ($0-100\%$)**
- **Reliability Rating**:
  - Score $\ge 90\% \implies \text{Excellent}$
  - $75\% \le \text{Score} < 90\% \implies \text{Good}$
  - $60\% \le \text{Score} < 75\% \implies \text{Fair}$
  - Score $< 60\% \implies \text{Poor}$

---

## 5. Database Schema Extensions

### `feedstock_batches` Extensions
- `feedstock_lot_number`: Text (indexed)
- `feedstock_category`: Text (`'Agricultural Residue'`, `'Wood Waste'`, `'Nut Shells'`)
- `biomass_species`: Text (`'Oryza sativa (Rice Husk)'`, `'Cocos nucifera (Coconut Shell)'`)
- `biomass_source_type`: Text (`'Farm Direct'`, `'Sawmill'`, `'Aggregator'`)
- `harvest_date`: Date
- `collection_date`: Date
- `storage_days`: Integer (default `0`)
- `storage_location`: Text
- `contamination_status`: Boolean (default `false`)
- `contamination_notes`: Text
- `visual_quality_grade`: Text (default `'Grade A'`)
- `quality_status`: Text (`'Optimal'`, `'Acceptable'`, `'Warning'`, `'High Risk'`, `'Rejected'`)
- `quality_score`: Double Precision ($0.0 - 100.0$)

### `feedstock_suppliers` Table
- `id`: UUID (Primary Key)
- `organization_id`: UUID
- `supplier_name`: Text
- `supplier_type`: Text (default `'Biomass Aggregator'`)
- `contact_information`: JSONB
- `operating_region`: Text
- `gps_location`: JSONB
- `sustainability_documents`: JSONB
- `certification_status`: Text (`'FSC Certified'`, `'PEFC'`, `'Self-Attested'`)
- `active_status`: Boolean (default `true`)
- `overall_quality_score`: Double Precision ($100.0$)
- `reliability_rating`: Text (`'Excellent'`, `'Good'`, `'Fair'`, `'Poor'`)

### `feedstock_intelligence_configs` Table
- `id`: UUID (Primary Key)
- `organization_id`: UUID (Unique)
- `max_moisture_percent`: Double Precision ($25.0\%$)
- `max_storage_days`: Integer ($60$)
- `min_supplier_score`: Double Precision ($70.0\%$)
- `contamination_strict`: Boolean (`true`)
- `quality_weights`: JSONB

---

## 6. API Reference

### 6.1 Feedstock Intelligence Dashboard & Trends
- **Endpoint**: `GET /api/v1/biochar/feedstock-intelligence/dashboard-stats`
- **Endpoint**: `GET /api/v1/biochar/feedstock-intelligence/trends`

### 6.2 Supplier Analytics & Rankings
- **Endpoint**: `GET /api/v1/biochar/feedstock-intelligence/supplier-analytics`

### 6.3 Feedstock Quality Evaluation & Recommendations
- **Endpoint**: `POST /api/v1/biochar/feedstock-intelligence/evaluate/{feedstock_id}`
- **Endpoint**: `GET /api/v1/biochar/feedstock-intelligence/recommendations`
- **Endpoint**: `GET /api/v1/biochar/feedstock-intelligence/alerts`

---

## 7. Chain of Custody Foundation (Phase 4 Ready)

Every feedstock lot registered in Phase 3 possesses a unique `feedstock_lot_number`, GPS coordinates, collection date, species classification, and quality status. In **Phase 4 (Chain of Custody Engine)**, these feedstock lots act as the immutable root nodes of the complete digital audit trail, linking biomass origin directly to pyrolysis runs, biochar production batches, laboratory certificates, and final field soil applications.

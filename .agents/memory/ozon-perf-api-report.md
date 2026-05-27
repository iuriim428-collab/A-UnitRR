---
name: Ozon Performance API report format
description: How the Ozon Performance API statistics report is structured and must be parsed
---

## Report format

When `GET /api/client/statistics/{UUID}` returns `state: "OK"`, the body contains a `link` field:

```json
{
  "state": "OK",
  "link": "/api/client/statistics/report?UUID=<uuid>",
  ...
}
```

The actual statistics are NOT in the polling response — fetch `GET PERF_BASE + link`.

## Report body structure

```json
{
  "<campaignId>": {
    "title": "Рекламная кампания № ...",
    "report": {
      "rows": [
        {
          "pageType": "Категории",
          "sku": "3378429729",       // Ozon item_id — matches transaction item.sku
          "moneySpent": "374,65",    // Russian decimal format (comma), NOT dot
          "views": "1410",
          "clicks": "34",
          "orders": "0",
          "ordersMoney": "0,00",
          ...
        }
      ]
    }
  }
}
```

**Key facts:**
- Keys are campaign IDs (strings)
- `sku` = Ozon item_id = same as `row.article` in SkuTable (from transaction `item.sku`)
- `moneySpent` uses Russian locale: `"374,65"` → `parseFloat("374,65".replace(",", "."))` = 374.65
- Same SKU appears multiple times (different page types) — must sum all rows per SKU
- Campaign objects endpoint returns `{ id: "3378429729" }` where id = item_id (not offer_id)
- Seller API `/v2/product/info/list` with `sku: [item_id]` returns 404 — can't resolve to offer_id

## Timing

Ozon's async stats generation is inconsistent: sometimes 5-10s, sometimes >60s.
Poll with 30 attempts × 2s = 60s max. If timeout, keep previous cached result.

**Why:** Ozon does NOT cache the link URL — each polling creates a new task UUID and a new report file.

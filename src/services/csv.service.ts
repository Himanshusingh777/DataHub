/**
 * CSVService
 *
 * All CSV parsing, validation, and column-mapping business logic.
 * UI uses this service — never calls the browser FileReader API directly.
 *
 * Extension point: replace parseFile() with a server-side parse request:
 *   POST /api/csv/parse  (multipart/form-data)
 *   Returns { columns, preview, totalRows, encoding, delimiter }
 */

import type { CSVData, CSVColumn, ColumnType } from "@/stores/flow-wizard.store";

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Service ───────────────────────────────────────────────────────────────────

export const CSVService = {
  /**
   * Parse a File object into structured CSVData.
   * Reads via FileReader, delegates to parseText().
   *
   * Extension point: POST file to /api/csv/parse instead of local parsing.
   */
  parseFile(file: File): Promise<CSVData> {
    return new Promise((resolve, reject) => {
      if (!file.name.match(/\.(csv|tsv|txt)$/i)) {
        reject(new Error("Only .csv, .tsv, or .txt files are supported."));
        return;
      }
      if (file.size > 52_428_800) {
        reject(new Error("File exceeds the 50 MB limit."));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          resolve(CSVService.parseText(text, file.name, file.size));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsText(file, "UTF-8");
    });
  },

  /**
   * Parse raw CSV text into structured CSVData.
   */
  parseText(text: string, fileName: string, fileSize: number): CSVData {
    const delimiter = CSVService.detectDelimiter(text);
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");

    if (lines.length < 2) {
      throw new Error("File must have at least a header row and one data row.");
    }

    const splitLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (ch === '"' && !inQuotes) { inQuotes = true; continue; }
        if (ch === '"' && inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
        if (ch === '"' && inQuotes) { inQuotes = false; continue; }
        if (ch === delimiter && !inQuotes) { result.push(cur); cur = ""; continue; }
        cur += ch;
      }
      result.push(cur);
      return result;
    };

    const headers = splitLine(lines[0]!).map((h) => h.trim().replace(/^"|"$/g, ""));
    const dataLines = lines.slice(1);
    const totalRows = dataLines.length;
    const analysisRows = dataLines.slice(0, 200).map(splitLine);
    const preview = dataLines.slice(0, 20).map(splitLine);

    const PK_CANDIDATES = ["id", "uuid", "key", "_id", "pk", "sku", "order_id", "user_id", "customer_id", "email"];
    let hasPrimaryKey = false;

    const columns: CSVColumn[] = headers.map((header, colIdx) => {
      const colValues = analysisRows.map((row) => row[colIdx] ?? "");
      const sample = analysisRows.slice(0, 5).map((row) => row[colIdx] ?? "");
      const nonEmptyCount = colValues.filter((v) => v.trim() !== "").length;
      const type = CSVService.detectType(colValues);

      const isPkCandidate =
        !hasPrimaryKey &&
        PK_CANDIDATES.some((k) => header.toLowerCase() === k || header.toLowerCase().endsWith(`_${k}`));

      if (isPkCandidate) hasPrimaryKey = true;

      const safe = header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

      return {
        name: header,
        displayName: safe || `column_${colIdx + 1}`,
        type,
        include: true,
        primaryKey: isPkCandidate,
        sample,
        nonEmptyCount,
        totalRows,
      };
    });

    return { fileName, fileSize, delimiter, encoding: "UTF-8", totalRows, columns, preview };
  },

  /** Detect the dominant delimiter in the first line of a CSV */
  detectDelimiter(text: string): "," | "\t" | ";" | "|" {
    const first = text.split("\n")[0] ?? "";
    const counts = {
      ",":  (first.match(/,/g)  ?? []).length,
      "\t": (first.match(/\t/g) ?? []).length,
      ";":  (first.match(/;/g)  ?? []).length,
      "|":  (first.match(/\|/g) ?? []).length,
    } as const;
    const winner = (Object.entries(counts) as [string, number][])
      .sort((a, b) => b[1] - a[1])[0]![0];
    return winner as "," | "\t" | ";" | "|";
  },

  /** Infer column data type from a sample of string values */
  detectType(values: string[]): ColumnType {
    const nonEmpty = values.filter((v) => v.trim() !== "");
    if (nonEmpty.length === 0) return "string";
    const boolLike = /^(true|false|yes|no|1|0)$/i;
    const numLike  = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
    const dateLike = /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}/;
    if (nonEmpty.every((v) => boolLike.test(v.trim()))) return "boolean";
    if (nonEmpty.every((v) => numLike.test(v.trim())))  return "number";
    if (nonEmpty.every((v) => dateLike.test(v.trim()))) return "date";
    return "string";
  },

  /**
   * Validate a parsed CSVData object before proceeding to column mapping.
   */
  validate(data: CSVData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (data.totalRows === 0) errors.push("File contains no data rows.");
    if (data.columns.length === 0) errors.push("No columns detected.");
    if (data.columns.length > 500) errors.push("File has too many columns (max 500).");

    const included = data.columns.filter((c) => c.include);
    if (included.length === 0) errors.push("At least one column must be included.");

    const hasPK = data.columns.some((c) => c.primaryKey);
    if (!hasPK) warnings.push("No primary key selected — deduplication may not work correctly.");

    data.columns.forEach((col) => {
      const fill = col.nonEmptyCount / col.totalRows;
      if (fill < 0.1) {
        warnings.push(`Column "${col.name}" is >90% empty — consider excluding it.`);
      }
    });

    return { valid: errors.length === 0, errors, warnings };
  },

  /** Human-readable file size */
  formatSize(bytes: number): string {
    if (bytes < 1024)          return `${bytes} B`;
    if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  },
};

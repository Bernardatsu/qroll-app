import firebaseConfig from "../../../firebase-applet-config.json";

const PROJECT_ID = firebaseConfig.projectId;
const API_KEY = firebaseConfig.apiKey;
const DATABASE_ID = firebaseConfig.firestoreDatabaseId || "(default)";

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

/** Convert a JS value to Firestore REST Value format */
export function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    return Number.isInteger(val) ? { integerValue: val.toString() } : { doubleValue: val };
  }
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === "object") {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

/** Convert a Firestore REST Value to plain JS value */
export function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== "object") return null;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("booleanValue" in val) return Boolean(val.booleanValue);
  if ("timestampValue" in val) return val.timestampValue;
  if ("nullValue" in val) return null;
  if ("arrayValue" in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ("mapValue" in val) {
    const res: Record<string, any> = {};
    const fields = val.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return null;
}

/** Convert a Firestore Document response to plain JS object with ID */
export function fromFirestoreDoc(doc: any): any {
  if (!doc || !doc.fields) return null;
  const id = doc.name ? doc.name.split("/").pop() : "";
  const result: Record<string, any> = { id };
  for (const [k, v] of Object.entries(doc.fields)) {
    result[k] = fromFirestoreValue(v);
  }
  return result;
}

/** Get a single document by collection and ID */
export async function getDocRest(collection: string, docId: string): Promise<any | null> {
  const url = `${BASE_URL}/${collection}/${encodeURIComponent(docId)}?key=${API_KEY}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch doc ${collection}/${docId}`);
  }
  const data = await res.json();
  return fromFirestoreDoc(data);
}

/** Set or update a single document */
export async function setDocRest(
  collection: string,
  docId: string,
  data: Record<string, any>,
  merge = true,
): Promise<any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }

  let url = `${BASE_URL}/${collection}/${encodeURIComponent(docId)}?key=${API_KEY}`;
  if (merge) {
    // In Firestore REST, updateMask defines which fields to write without clearing others
    const fieldParams = Object.keys(fields)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join("&");
    if (fieldParams) url += `&${fieldParams}`;
  }

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to save doc ${collection}/${docId}`);
  }
  const saved = await res.json();
  return fromFirestoreDoc(saved);
}

/** Delete a document */
export async function deleteDocRest(collection: string, docId: string): Promise<boolean> {
  const url = `${BASE_URL}/${collection}/${encodeURIComponent(docId)}?key=${API_KEY}`;
  const res = await fetch(url, { method: "DELETE" });
  return res.ok;
}

/** Run a query against a collection */
export async function queryCollectionRest(
  collectionId: string,
  options?: {
    where?: Array<{ field: string; op: "EQUAL" | "GREATER_THAN" | "LESS_THAN"; value: any }>;
    limit?: number;
  },
): Promise<any[]> {
  const structuredQuery: any = {
    from: [{ collectionId }],
  };

  if (options?.where && options.where.length > 0) {
    if (options.where.length === 1) {
      const w = options.where[0];
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: w.field },
          op: w.op,
          value: toFirestoreValue(w.value),
        },
      };
    } else {
      structuredQuery.where = {
        compositeFilter: {
          op: "AND",
          filters: options.where.map((w) => ({
            fieldFilter: {
              field: { fieldPath: w.field },
              op: w.op,
              value: toFirestoreValue(w.value),
            },
          })),
        },
      };
    }
  }

  if (options?.limit) {
    structuredQuery.limit = options.limit;
  }

  const url = `${BASE_URL}:runQuery?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Query on ${collectionId} failed`);
  }

  const list = await res.json();
  const results: any[] = [];
  for (const item of list) {
    if (item.document) {
      const doc = fromFirestoreDoc(item.document);
      if (doc) results.push(doc);
    }
  }
  return results;
}

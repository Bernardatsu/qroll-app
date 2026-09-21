import firebaseConfig from "../../../firebase-applet-config.json";

const PROJECT_ID = firebaseConfig.projectId;
const API_KEY = firebaseConfig.apiKey;
const DATABASE_ID = firebaseConfig.firestoreDatabaseId || "(default)";

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

/** Standard fallback academic departments for KNUST & tertiary institutions */
export const FALLBACK_DEPARTMENTS = [
  { id: "dept_cs", name: "Computer Science", code: "CS", faculty: "Faculty of Physical Sciences" },
  {
    id: "dept_ee",
    name: "Electrical & Electronic Engineering",
    code: "EEE",
    faculty: "College of Engineering",
  },
  {
    id: "dept_me",
    name: "Mechanical Engineering",
    code: "ME",
    faculty: "College of Engineering",
  },
  { id: "dept_ce", name: "Civil Engineering", code: "CE", faculty: "College of Engineering" },
  {
    id: "dept_che",
    name: "Chemical Engineering",
    code: "CHE",
    faculty: "College of Engineering",
  },
  {
    id: "dept_pet",
    name: "Petroleum Engineering",
    code: "PET",
    faculty: "College of Engineering",
  },
  {
    id: "dept_math",
    name: "Mathematics & Statistics",
    code: "MATH",
    faculty: "Faculty of Physical Sciences",
  },
  {
    id: "dept_med",
    name: "Medicine & Surgery",
    code: "MED",
    faculty: "School of Medicine and Dentistry",
  },
  { id: "dept_nurs", name: "Nursing", code: "NURS", faculty: "College of Health Sciences" },
  { id: "dept_pharm", name: "Pharmacy", code: "PHARM", faculty: "Faculty of Pharmacy" },
  { id: "dept_bus", name: "Business Administration", code: "BA", faculty: "School of Business" },
  { id: "dept_acc", name: "Accounting & Finance", code: "ACC", faculty: "School of Business" },
  { id: "dept_law", name: "Faculty of Law", code: "LAW", faculty: "Faculty of Law" },
  {
    id: "dept_arch",
    name: "Architecture",
    code: "ARCH",
    faculty: "College of Art and Built Environment",
  },
  {
    id: "dept_agric",
    name: "Agricultural Engineering",
    code: "AGR",
    faculty: "College of Agriculture",
  },
  { id: "dept_phys", name: "Physics", code: "PHYS", faculty: "Faculty of Physical Sciences" },
  { id: "dept_gen", name: "General Studies", code: "GEN", faculty: "General" },
];

/** In-memory cache for query results to protect free-tier daily read limits */
interface CacheEntry {
  data: any;
  expiresAt: number;
}
const queryCache = new Map<string, CacheEntry>();

export function getCachedData(key: string): any | null {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry.data;
}

export function getStaleData(key: string): any | null {
  const entry = queryCache.get(key);
  return entry ? entry.data : null;
}

export function setCachedData(key: string, data: any, ttlMs: number): void {
  queryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidateCache(collectionPrefix?: string): void {
  if (!collectionPrefix) {
    queryCache.clear();
    return;
  }
  for (const key of queryCache.keys()) {
    if (key.startsWith(collectionPrefix)) {
      queryCache.delete(key);
    }
  }
}

/** Robust error extractor supporting Firestore REST object and array errors */
export function extractFirestoreError(
  payload: any,
  status?: number,
): {
  isQuotaError: boolean;
  message: string;
  code: number;
} {
  let rawMessage = "";
  let code = status || 500;

  if (Array.isArray(payload) && payload[0]?.error) {
    rawMessage = payload[0].error.message || "";
    code = payload[0].error.code || code;
  } else if (payload?.error) {
    rawMessage = payload.error.message || "";
    code = payload.error.code || code;
  } else if (typeof payload === "string") {
    rawMessage = payload;
  }

  const isQuota =
    code === 429 ||
    rawMessage.includes("Quota exceeded") ||
    rawMessage.includes("RESOURCE_EXHAUSTED") ||
    rawMessage.includes("Free daily read units") ||
    rawMessage.includes("quota metric");

  let message = rawMessage;
  if (isQuota) {
    message =
      "Firestore free daily read quota reached. Resets at 00:00 UTC, or upgrade to Firebase Blaze pay-as-you-go for uninterrupted access.";
  } else if (!message) {
    message = `Firestore request failed (status ${code})`;
  }

  return { isQuotaError: isQuota, message, code };
}

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

/** Get a single document by collection and ID with caching */
export async function getDocRest(collection: string, docId: string): Promise<any | null> {
  const cacheKey = `doc:${collection}:${docId}`;
  const cached = getCachedData(cacheKey);
  if (cached !== null) return cached;

  const url = `${BASE_URL}/${collection}/${encodeURIComponent(docId)}?key=${API_KEY}`;
  const res = await fetch(url);
  if (res.status === 404) return null;

  if (!res.ok) {
    const errPayload = await res.json().catch(() => ({}));
    const err = extractFirestoreError(errPayload, res.status);
    const stale = getStaleData(cacheKey);
    if (stale !== null) {
      console.warn(`Serving stale doc for ${collection}/${docId} due to: ${err.message}`);
      return stale;
    }
    throw new Error(err.message);
  }

  const data = await res.json();
  const doc = fromFirestoreDoc(data);
  // Cache single doc for 60s
  if (doc) setCachedData(cacheKey, doc, 60 * 1000);
  return doc;
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
    const errPayload = await res.json().catch(() => ({}));
    const err = extractFirestoreError(errPayload, res.status);
    throw new Error(err.message);
  }

  const saved = await res.json();
  const resultDoc = fromFirestoreDoc(saved);

  // Invalidate collection caches to maintain consistency
  invalidateCache(collection);
  invalidateCache(`query:${collection}`);
  invalidateCache(`doc:${collection}:${docId}`);

  return resultDoc;
}

/** Delete a document */
export async function deleteDocRest(collection: string, docId: string): Promise<boolean> {
  const url = `${BASE_URL}/${collection}/${encodeURIComponent(docId)}?key=${API_KEY}`;
  const res = await fetch(url, { method: "DELETE" });

  // Invalidate caches
  invalidateCache(collection);
  invalidateCache(`query:${collection}`);
  invalidateCache(`doc:${collection}:${docId}`);

  return res.ok;
}

/** Run a query against a collection with memory caching and quota resilience */
export async function queryCollectionRest(
  collectionId: string,
  options?: {
    where?: Array<{ field: string; op: "EQUAL" | "GREATER_THAN" | "LESS_THAN"; value: any }>;
    limit?: number;
    skipCache?: boolean;
    ttlMs?: number;
  },
): Promise<any[]> {
  const cacheKey = `query:${collectionId}:${JSON.stringify(options?.where || [])}:${options?.limit || 0}`;

  if (!options?.skipCache) {
    const cached = getCachedData(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

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
    const errPayload = await res.json().catch(() => ({}));
    const err = extractFirestoreError(errPayload, res.status);

    // Stale cached fallback
    const stale = getStaleData(cacheKey);
    if (stale !== null) {
      console.warn(`Serving stale query cache for ${collectionId} due to: ${err.message}`);
      return stale;
    }

    // Special fallback for departments
    if (collectionId === "departments") {
      console.warn("Serving built-in fallback departments list due to database quota/error");
      return FALLBACK_DEPARTMENTS;
    }

    throw new Error(err.message);
  }

  const list = await res.json();
  const results: any[] = [];
  if (Array.isArray(list)) {
    for (const item of list) {
      if (item.document) {
        const doc = fromFirestoreDoc(item.document);
        if (doc) results.push(doc);
      }
    }
  }

  // Determine TTL: catalogs (departments, courses) get 10 mins; other queries get 60s
  const defaultTtl =
    collectionId === "departments" || collectionId === "courses"
      ? 10 * 60 * 1000
      : collectionId === "attendance_sessions"
        ? 3 * 60 * 1000
        : 60 * 1000;

  const ttl = options?.ttlMs ?? defaultTtl;
  setCachedData(cacheKey, results, ttl);

  return results;
}

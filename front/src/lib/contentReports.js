import axios from "axios";

function getApiUrl() {
  const apiUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

  return apiUrl.replace(/\/$/, "");
}

const API_URL = getApiUrl();

const api = axios.create({
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

const ALLOWED_STATUSES = new Set([
  "pending",
  "reviewing",
  "resolved",
  "rejected",
  "spam",
]);

function normalizeNullableText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function normalizeReportableId(value) {
  const numericValue = Number(value);

  if (Number.isSafeInteger(numericValue) && numericValue > 0) {
    return numericValue;
  }

  return null;
}

function cleanContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}

export function cleanContentReportPayload(data = {}) {
  const reportableId = normalizeReportableId(data?.reportable_id);

  if (reportableId === null) {
    throw new Error("報告対象のIDが正しく取得できませんでした");
  }

  return {
    reportable_type: String(data?.reportable_type ?? "").trim(),
    reportable_id: reportableId,
    category: "incorrect_info",
    field_key: null,
    message: String(data?.message ?? "").trim(),
    locale: String(data?.locale ?? "ja").trim() || "ja",
    context_json: cleanContext(data?.context_json),
  };
}

function createContentReportError(error) {
  if (error instanceof Error && !error?.response) {
    return error;
  }

  const responseData = error?.response?.data;
  const firstValidationError = Object.values(responseData?.errors ?? {})
    .flat()
    .find((value) => typeof value === "string" && value.trim());

  const message =
    firstValidationError ||
    responseData?.message ||
    "情報の送信に失敗しました";

  const apiError = new Error(message);
  apiError.status = error?.response?.status ?? null;
  apiError.payload = responseData ?? null;

  return apiError;
}

export async function createContentReport(data) {
  try {
    const response = await api.post(
      `${API_URL}/api/content-reports`,
      cleanContentReportPayload(data)
    );

    return response.data;
  } catch (error) {
    console.error("Content report create error:", error);
    throw createContentReportError(error);
  }
}

export function normalizeContentReport(row = {}) {
  return {
    id: row?.id ?? null,
    reportable_type: row?.reportable_type ?? "",
    reportable_id: normalizeReportableId(row?.reportable_id),
    target_label:
      normalizeNullableText(row?.target_label) ||
      normalizeNullableText(row?.context_json?.target_label),
    category: row?.category ?? "other",
    field_key: normalizeNullableText(row?.field_key),
    message: String(row?.message ?? ""),
    context_json:
      row?.context_json && typeof row.context_json === "object"
        ? row.context_json
        : {},
    status: row?.status ?? "pending",
    is_public: Boolean(row?.is_public),
    resolved_note: normalizeNullableText(row?.resolved_note),
    locale: row?.locale ?? "ja",
    reviewed_by: row?.reviewed_by ?? null,
    reviewed_at: row?.reviewed_at ?? null,
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
  };
}

export async function fetchPublicContentReportSummary({
  reportable_type,
  reportable_id,
} = {}) {
  const reportableId = normalizeReportableId(reportable_id);

  if (reportableId === null) {
    throw new Error("報告対象のIDが正しく取得できませんでした");
  }

  try {
    const response = await api.get(
      `${API_URL}/api/content-reports/summary`,
      {
        params: {
          reportable_type: String(reportable_type ?? "").trim(),
          reportable_id: reportableId,
        },
      }
    );

    return {
      count: Math.max(0, Number(response.data?.data?.count) || 0),
    };
  } catch (error) {
    console.error("Content report summary fetch error:", error);
    throw createContentReportError(error);
  }
}

export async function fetchPublicContentReports({
  reportable_type,
  reportable_id,
  locale,
  limit = 20,
} = {}) {
  const reportableId = normalizeReportableId(reportable_id);

  if (reportableId === null) {
    throw new Error("報告対象のIDが正しく取得できませんでした");
  }

  try {
    const response = await api.get(`${API_URL}/api/content-reports`, {
      params: {
        reportable_type: String(reportable_type ?? "").trim(),
        reportable_id: reportableId,
        locale: String(locale ?? "").trim() || undefined,
        limit,
      },
    });

    const rows = Array.isArray(response.data?.data)
      ? response.data.data
      : [];

    return rows.map(normalizeContentReport);
  } catch (error) {
    console.error("Content report fetch error:", error);
    throw createContentReportError(error);
  }
}

export async function fetchAdminContentReports(params = {}) {
  try {
    const response = await api.get(`${API_URL}/api/admin/content-reports`, {
      params: {
        q: String(params?.q ?? "").trim() || undefined,
        reportable_type:
          String(params?.reportable_type ?? "").trim() || undefined,
        status: String(params?.status ?? "").trim() || undefined,
        is_public:
          params?.is_public === true
            ? 1
            : params?.is_public === false
              ? 0
              : undefined,
        page: Number(params?.page) > 0 ? Number(params.page) : 1,
        per_page: Number(params?.per_page) > 0 ? Number(params.per_page) : 20,
      },
    });

    const rows = Array.isArray(response.data?.data)
      ? response.data.data
      : [];

    return {
      data: rows.map(normalizeContentReport),
      meta: {
        current_page: Number(response.data?.meta?.current_page ?? 1),
        last_page: Number(response.data?.meta?.last_page ?? 1),
        per_page: Number(response.data?.meta?.per_page ?? 20),
        total: Number(response.data?.meta?.total ?? rows.length),
      },
    };
  } catch (error) {
    console.error("Admin content reports fetch error:", error);
    throw createContentReportError(error);
  }
}

export async function updateAdminContentReport(id, data = {}) {
  const numericId = normalizeReportableId(id);

  if (numericId === null) {
    throw new Error("コメントIDが正しくありません");
  }

  const status = String(data?.status ?? "pending").trim();

  try {
    const response = await api.patch(
      `${API_URL}/api/admin/content-reports/${numericId}`,
      {
        status: ALLOWED_STATUSES.has(status) ? status : "pending",
        is_public: Boolean(data?.is_public),
        resolved_note: normalizeNullableText(data?.resolved_note),
      }
    );

    return normalizeContentReport(response.data?.data ?? {});
  } catch (error) {
    console.error("Admin content report update error:", error);
    throw createContentReportError(error);
  }
}

export async function deleteAdminContentReport(id) {
  const numericId = normalizeReportableId(id);

  if (numericId === null) {
    throw new Error("コメントIDが正しくありません");
  }

  try {
    const response = await api.delete(
      `${API_URL}/api/admin/content-reports/${numericId}`
    );

    return response.data;
  } catch (error) {
    console.error("Admin content report delete error:", error);
    throw createContentReportError(error);
  }
}

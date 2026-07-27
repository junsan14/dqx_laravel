"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import {
  createContentReport,
  fetchPublicContentReportSummary,
  fetchPublicContentReports,
} from "@/lib/contentReports";
import styles from "./ContentReportArea.module.css";

const MIN_MESSAGE_LENGTH = 5;
const MAX_MESSAGE_LENGTH = 1000;

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function parseReportDate(value) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateKey(value) {
  const date = parseReportDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateDivider(value, locale) {
  const date = parseReportDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(locale === "en" ? "en" : "ja-JP", {
    year: "numeric",
    month: locale === "en" ? "long" : "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatReportTime(value, locale) {
  const date = parseReportDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(locale === "en" ? "en" : "ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "en",
  }).format(date);
}

export default function ContentReportArea({
  reportableType,
  reportableId,
  targetLabel = "",
  context = {},
  submitReport = createContentReport,
  loadReports = fetchPublicContentReports,
  loadReportSummary = fetchPublicContentReportSummary,
  showPublicReports = true,
  publicReportLimit = 20,
  title,
  description,
  className = "",
  disabled = false,
  onSubmitted,
}) {
  const currentLocale = useLocale();
  const t = useTranslations("ContentReportArea");
  const normalizedId = normalizePositiveInteger(reportableId);
  const normalizedType = String(reportableType ?? "").trim();
  const targetAvailable =
    !disabled && Boolean(normalizedType) && normalizedId !== null;

  const rootRef = useRef(null);
  const summaryRequestRef = useRef(0);
  const publicRequestRef = useRef(0);
  const firstFieldRef = useRef(null);
  const successToastTimerRef = useRef(null);

  const [portalReady, setPortalReady] = useState(false);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [publicCount, setPublicCount] = useState(0);
  const [summaryStatus, setSummaryStatus] = useState("idle");
  const [isPublicOpen, setIsPublicOpen] = useState(false);
  const [publicReports, setPublicReports] = useState([]);
  const [publicStatus, setPublicStatus] = useState("idle");
  const [publicError, setPublicError] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitError, setSubmitError] = useState("");
  const [successToastVisible, setSuccessToastVisible] = useState(false);

  const hasPublicReports =
    showPublicReports &&
    targetAvailable &&
    summaryStatus === "success" &&
    publicCount > 0;

  const conversationItems = useMemo(() => {
    const items = [];

    publicReports.forEach((report, reportIndex) => {
      if (report?.message) {
        items.push({
          id: `report-${report.id ?? reportIndex}`,
          side: "left",
          text: report.message,
          timestamp: report.created_at,
          order: reportIndex * 2,
        });
      }

      if (report?.resolved_note) {
        items.push({
          id: `reply-${report.id ?? reportIndex}`,
          side: "right",
          text: report.resolved_note,
          quotedText: report.message || "",
          timestamp:
            report.reviewed_at || report.updated_at || report.created_at,
          order: reportIndex * 2 + 1,
        });
      }
    });

    return items
      .sort((a, b) => {
        const aTime = parseReportDate(a.timestamp)?.getTime();
        const bTime = parseReportDate(b.timestamp)?.getTime();

        if (aTime == null && bTime == null) return a.order - b.order;
        if (aTime == null) return 1;
        if (bTime == null) return -1;
        return aTime === bTime ? a.order - b.order : aTime - bTime;
      })
      .map((item, index, sortedItems) => {
        const currentDateKey = getDateKey(item.timestamp);
        const previousDateKey =
          index > 0 ? getDateKey(sortedItems[index - 1].timestamp) : "";

        return {
          ...item,
          dateLabel:
            currentDateKey && currentDateKey !== previousDateKey
              ? formatDateDivider(item.timestamp, currentLocale)
              : "",
          timeLabel: formatReportTime(item.timestamp, currentLocale),
        };
      });
  }, [currentLocale, publicReports]);

  useEffect(() => {
    setPortalReady(true);

    return () => {
      if (successToastTimerRef.current) {
        window.clearTimeout(successToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setIsNearViewport(false);

    if (!showPublicReports || !targetAvailable) {
      return undefined;
    }

    const element = rootRef.current;

    if (
      !element ||
      typeof window === "undefined" ||
      typeof window.IntersectionObserver === "undefined"
    ) {
      setIsNearViewport(true);
      return undefined;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        setIsNearViewport(true);
        observer.disconnect();
      },
      {
        root: null,
        rootMargin: "500px 0px",
        threshold: 0,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [
    normalizedType,
    normalizedId,
    showPublicReports,
    targetAvailable,
  ]);

  useEffect(() => {
    summaryRequestRef.current += 1;
    publicRequestRef.current += 1;

    setPublicCount(0);
    setSummaryStatus("idle");
    setIsPublicOpen(false);
    setPublicReports([]);
    setPublicStatus("idle");
    setPublicError("");

    setIsModalOpen(false);
    setMessage("");
    setWebsite("");
    setSubmitStatus("idle");
    setSubmitError("");
    setSuccessToastVisible(false);

    if (showPublicReports && targetAvailable && isNearViewport) {
      checkPublicReportSummary();
    }
  }, [
    normalizedType,
    normalizedId,
    showPublicReports,
    targetAvailable,
    isNearViewport,
  ]);

  useEffect(() => {
    if (!isModalOpen || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape" && submitStatus !== "submitting") {
        setIsModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen, submitStatus]);

  async function checkPublicReportSummary() {
    if (!showPublicReports || !targetAvailable) return;

    const requestId = summaryRequestRef.current + 1;
    summaryRequestRef.current = requestId;

    try {
      setSummaryStatus("loading");

      const summary = await loadReportSummary({
        reportable_type: normalizedType,
        reportable_id: normalizedId,
      });

      if (summaryRequestRef.current !== requestId) return;

      const count = Math.max(0, Number(summary?.count) || 0);
      setPublicCount(count);
      setSummaryStatus("success");

      if (count === 0) {
        setIsPublicOpen(false);
        setPublicReports([]);
        setPublicStatus("idle");
        setPublicError("");
      }
    } catch (error) {
      if (summaryRequestRef.current !== requestId) return;
      console.error("Public content report summary error:", error);
      setPublicCount(0);
      setSummaryStatus("error");
    }
  }

  async function loadPublicReports({ force = false } = {}) {
    if (!showPublicReports || !targetAvailable) return;
    if (!force && (publicStatus === "loading" || publicStatus === "success")) {
      return;
    }

    const requestId = publicRequestRef.current + 1;
    publicRequestRef.current = requestId;

    try {
      setPublicStatus("loading");
      setPublicError("");

      const rows = await loadReports({
        reportable_type: normalizedType,
        reportable_id: normalizedId,
        locale: currentLocale,
        limit: publicReportLimit,
      });

      if (publicRequestRef.current !== requestId) return;

      const normalizedRows = Array.isArray(rows) ? rows : [];
      setPublicReports(normalizedRows);
      setPublicStatus("success");

      if (normalizedRows.length === 0) {
        setPublicCount(0);
        setIsPublicOpen(false);
      }
    } catch (error) {
      if (publicRequestRef.current !== requestId) return;
      console.error("Public content reports load error:", error);
      setPublicReports([]);
      setPublicStatus("error");
      setPublicError(error?.message || t("publicError"));
    }
  }

  async function handlePublicToggle() {
    const nextOpen = !isPublicOpen;
    setIsPublicOpen(nextOpen);

    if (nextOpen && (publicStatus === "idle" || publicStatus === "error")) {
      await loadPublicReports({ force: publicStatus === "error" });
    }
  }

  function resetForm() {
    setMessage("");
    setWebsite("");
    setSubmitStatus("idle");
    setSubmitError("");
  }

  function showSuccessToast() {
    if (successToastTimerRef.current) {
      window.clearTimeout(successToastTimerRef.current);
    }

    setSuccessToastVisible(true);
    successToastTimerRef.current = window.setTimeout(() => {
      setSuccessToastVisible(false);
      successToastTimerRef.current = null;
    }, 2600);
  }

  function closeModal() {
    if (submitStatus === "submitting") return;
    setIsModalOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedMessage = message.trim();

    if (!targetAvailable) {
      setSubmitError(t("unavailable"));
      return;
    }

    if (trimmedMessage.length < MIN_MESSAGE_LENGTH) {
      setSubmitError(t("messageTooShort", { min: MIN_MESSAGE_LENGTH }));
      return;
    }

    if (website.trim()) {
      resetForm();
      setIsModalOpen(false);
      showSuccessToast();
      return;
    }

    const payload = {
      reportable_type: normalizedType,
      reportable_id: normalizedId,
      category: "incorrect_info",
      field_key: null,
      message: trimmedMessage,
      locale: currentLocale,
      context_json: {
        ...(context && typeof context === "object" ? context : {}),
        target_label: targetLabel || undefined,
        page_url:
          typeof window !== "undefined" ? window.location.href : undefined,
      },
    };

    try {
      setSubmitStatus("submitting");
      setSubmitError("");
      const result = await submitReport(payload);
      onSubmitted?.(result, payload);
      resetForm();
      setIsModalOpen(false);
      showSuccessToast();
    } catch (error) {
      console.error("Content report submit error:", error);
      setSubmitStatus("error");
      setSubmitError(
        error?.status === 429
          ? t("rateLimited")
          : error?.message || t("genericError")
      );
    }
  }

  const rootClassName = [styles.root, className].filter(Boolean).join(" ");

  const modal =
    portalReady && isModalOpen
      ? createPortal(
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeModal();
            }}
          >
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="content-report-modal-title"
            >
              <div className={styles.modalHeader}>
                <div>
                  <h2 id="content-report-modal-title">
                    {title || t("title")}
                  </h2>
                  <p>{description || t("description")}</p>
                </div>

                <button
                  type="button"
                  className={styles.modalCloseButton}
                  onClick={closeModal}
                  disabled={submitStatus === "submitting"}
                  aria-label={t("modalClose")}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <form className={styles.form} onSubmit={handleSubmit} noValidate>
                  {targetLabel ? (
                    <div className={styles.targetRow}>
                      <span>{t("target")}</span>
                      <strong>{targetLabel}</strong>
                    </div>
                  ) : null}

                  <p className={styles.anonymousNote}>{t("anonymous")}</p>

                  <label className={styles.field}>
                    <span>{t("message")}</span>
                    <textarea
                      ref={firstFieldRef}
                      className={styles.textarea}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder={t("messagePlaceholder")}
                      rows={7}
                      maxLength={MAX_MESSAGE_LENGTH}
                      disabled={submitStatus === "submitting"}
                    />
                    <small>
                      {message.length}/{MAX_MESSAGE_LENGTH}
                    </small>
                  </label>

                  <label className={styles.honeypot} aria-hidden="true">
                    Website
                    <input
                      type="text"
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </label>

                  {submitError ? (
                    <p className={styles.submitError} role="alert">
                      {submitError}
                    </p>
                  ) : null}

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={closeModal}
                      disabled={submitStatus === "submitting"}
                    >
                      {t("close")}
                    </button>
                    <button
                      type="submit"
                      className={styles.submitButton}
                      disabled={
                        submitStatus === "submitting" ||
                        !targetAvailable ||
                        message.trim().length < MIN_MESSAGE_LENGTH
                      }
                    >
                      {submitStatus === "submitting" ? (
                        <span className={styles.spinner} aria-hidden="true" />
                      ) : null}
                      {submitStatus === "submitting"
                        ? t("submitting")
                        : t("submit")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const successToast =
    portalReady && successToastVisible
      ? createPortal(
          <div
            className={styles.successToast}
            role="status"
            aria-live="polite"
          >
            <span className={styles.successToastIcon} aria-hidden="true">
              ✓
            </span>
            <span className={styles.successToastText}>{t("successTitle")}</span>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <section ref={rootRef} className={rootClassName}>
        <div className={styles.reportActionRow}>
          <button
            type="button"
            className={styles.reportTriggerButton}
            onClick={() => setIsModalOpen(true)}
            disabled={!targetAvailable}
          >
            <span className={styles.warningIcon} aria-hidden="true">
              !
            </span>
            <span>{t("trigger")}</span>
          </button>
        </div>

        {hasPublicReports ? (
          <div className={styles.accordion}>
            <button
              type="button"
              className={styles.accordionButton}
              onClick={handlePublicToggle}
              aria-expanded={isPublicOpen}
            >
              <span className={styles.accordionButtonText}>
                <strong>{t("publicTitle")}</strong>
                <small>{t("reportCount", { count: publicCount })}</small>
              </span>
              <span className={styles.chevron} aria-hidden="true">
                {isPublicOpen ? "−" : "+"}
              </span>
            </button>

            {isPublicOpen ? (
              <div className={styles.accordionBody}>
                {publicStatus === "loading" ? (
                  <div className={styles.loadingRow} role="status">
                    <span className={styles.spinner} aria-hidden="true" />
                    <span>{t("publicLoading")}</span>
                  </div>
                ) : null}

                {publicStatus === "error" ? (
                  <p className={styles.errorBox} role="alert">
                    {publicError || t("publicError")}
                  </p>
                ) : null}

                {conversationItems.length > 0 ? (
                  <div className={styles.publicList}>
                    {conversationItems.map((item) => (
                      <div key={item.id} className={styles.chatEntry}>
                        {item.dateLabel ? (
                          <div className={styles.dateSeparator}>
                            <span>{item.dateLabel}</span>
                          </div>
                        ) : null}

                        <div
                          className={`${styles.messageRow} ${
                            item.side === "right"
                              ? styles.adminMessageRow
                              : ""
                          }`}
                        >
                          <div
                            className={`${styles.messageBubble} ${
                              item.side === "right"
                                ? styles.adminBubble
                                : styles.reportBubble
                            }`}
                          >
                            <div className={styles.bubbleContent}>
                              {item.side === "right" && item.quotedText ? (
                                <div className={styles.replyQuote}>
                                  <span className={styles.replyQuoteLabel}>
                                    {t("replyQuoteLabel")}
                                  </span>
                                  <p className={styles.replyQuoteText}>
                                    {item.quotedText}
                                  </p>
                                </div>
                              ) : null}

                              <p className={styles.bubbleText}>{item.text}</p>
                            </div>

                            {item.timeLabel ? (
                              <time
                                dateTime={item.timestamp}
                                className={styles.bubbleTime}
                              >
                                {item.timeLabel}
                              </time>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {modal}
      {successToast}
    </>
  );
}

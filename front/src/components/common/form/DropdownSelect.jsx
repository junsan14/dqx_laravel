"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./SearchControl.module.css";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function defaultGetValue(option) {
  return option?.value ?? option?.id ?? "";
}

function defaultGetLabel(option) {
  return option?.label ?? option?.name ?? "";
}

function defaultGetDescription() {
  return "";
}

export default function DropdownSelect({
  value = "",
  onChange,
  options = [],
  disabled = false,
  placeholder = "選択してください",
  emptyText = "選択肢がありません",
  getOptionValue = defaultGetValue,
  getOptionLabel = defaultGetLabel,
  getOptionDescription = defaultGetDescription,
  sortOptions,
  className = "",
  triggerClassName = "",
  dropdownClassName = "",
  ariaLabel,
}) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listboxId = useId();

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const normalizedOptions = useMemo(
    () => (sortOptions ? [...options].sort(sortOptions) : [...options]),
    [options, sortOptions]
  );

  const selectedIndex = useMemo(
    () =>
      normalizedOptions.findIndex(
        (option) => String(getOptionValue(option)) === String(value)
      ),
    [getOptionValue, normalizedOptions, value]
  );

  const selectedOption =
    selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null;

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!open) return;

    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  function selectOption(option) {
    if (!option) return;

    const nextValue = String(getOptionValue(option));

    onChange?.(nextValue, option, { reason: "select" });
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveHighlight(amount) {
    if (normalizedOptions.length === 0) return;

    setHighlightedIndex((current) => {
      const next = current + amount;

      if (next < 0) return normalizedOptions.length - 1;
      if (next >= normalizedOptions.length) return 0;

      return next;
    });
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      moveHighlight(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      moveHighlight(-1);
      return;
    }

    if (event.key === "Home" && open) {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }

    if (event.key === "End" && open) {
      event.preventDefault();
      setHighlightedIndex(Math.max(normalizedOptions.length - 1, 0));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      selectOption(normalizedOptions[highlightedIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  const selectedLabel = selectedOption
    ? String(getOptionLabel(selectedOption))
    : placeholder;

  return (
    <div ref={rootRef} className={cn(styles.root, className)}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        className={cn(
          styles.trigger,
          open && styles.triggerOpen,
          triggerClassName
        )}
      >
        <span className={styles.triggerLabel}>{selectedLabel}</span>

        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={cn(
            styles.triggerIcon,
            open && styles.triggerIconOpen
          )}
        >
          <path
            d="m5.5 7.5 4.5 4.5 4.5-4.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>

      {open && !disabled ? (
        <div
          id={listboxId}
          role="listbox"
          className={cn(styles.dropdown, dropdownClassName)}
        >
          {normalizedOptions.length === 0 ? (
            <div className={styles.empty}>{emptyText}</div>
          ) : (
            normalizedOptions.map((option, index) => {
              const optionValue = String(getOptionValue(option));
              const active = optionValue === String(value);
              const description = getOptionDescription(option);

              return (
                <button
                  key={`${optionValue}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectOption(option)}
                  className={cn(
                    styles.option,
                    active && styles.optionActive,
                    index === highlightedIndex && styles.optionHighlighted
                  )}
                >
                  <span className={styles.optionContent}>
                    <span className={styles.optionLabel}>
                      {getOptionLabel(option)}
                    </span>

                    {description ? (
                      <span className={styles.optionDescription}>
                        {description}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
